console.log = () => {}; // pstree.remy can't be trusted not to print console logs -_-

import { ChildProcess } from "child_process";
import { FSWatcher } from "fs";
import watch from "node-watch";
import * as path from "path";
import * as psTree from "pstree.remy";

import { ScriptSimple } from "../commandExecution";
import { sleep } from "../utils";

export const killWithSignal = async (pid: number, signal: number) => {
    const children = await new Promise<number[]>((resolve, reject) => {
        if (!psTree.hasPS) return resolve([]);

        psTree(pid, (...args: [null, number[]] | [Error]) => {
            if (args[0]) return reject(args[0]);
            resolve(args[1]);
        });
    });

    const orderedChildren = children.sort((a, b) => b - a);

    for (const child of orderedChildren) {
        process.kill(child, signal);
    }

    process.kill(pid, signal);
}

export const createLock = () => {
    let _lock: Promise<void> | undefined;
    const lock = async (): Promise<() => void> => {
        if (_lock === undefined) {
            let unlock: () => void;
            _lock = new Promise((resolve) => {
                unlock = () => {
                    resolve();
                    _lock = undefined;
                }
            });
            return unlock!;
        }

        await _lock;
        return lock();
    }

    const isAvailable = () => _lock === undefined;

    return Object.assign(lock, { isAvailable });
}

export type CloseBehavior =
    | { kind: "restart" }
    | { kind: "wait" }
    | { kind: "callback", onClose: () => void }

export abstract class Runner {
    protected script;
    protected additionalArgs;
    protected closeBehavior;
    protected print;

    protected watcher: FSWatcher | undefined;
    protected proc: ChildProcess | undefined;

    protected processLock = createLock();

    constructor (
        script: ScriptSimple,
        args: string[],
        closeBehavior: CloseBehavior,
        print: (msg: string) => Promise<void>,
    ) {
        this.script = script;
        this.additionalArgs = args;
        this.print = print;
        this.closeBehavior = closeBehavior

        this.onClose = this.onClose.bind(this);
    }

    protected get command() {
        if (this.script.kind === "resolved") {
            return "yarn"
        } else {
            return this.script.command;
        }
    }

    protected get args() {
        if (this.script.kind === "resolved") {
            return [
                "_r_internal_2",
                "--command", JSON.stringify(this.script.script + " " + this.additionalArgs.join(" ")),
            ]
        } else {
            return this.additionalArgs;
        }
    }

    protected get cwd() {
        return this.script.kind === "resolved" ? this.script.workingDirectory : undefined;
    }

    public abstract _start(): ChildProcess;

    protected async onClose(code: number) {
        if (code) {
            this.print(`Process exited with code ${code}\n`);
        }

        this.proc = undefined;

        if (this.closeBehavior.kind === "restart") {
            this.start();
        } else if (this.closeBehavior.kind === "callback") {
            this.closeBehavior.onClose();
        }
    }

    protected startWatching() {
        if (!this.watcher && this.script.watch.length > 0) {
            const baseDir = this.script.kind === "resolved" ? this.script.workingDirectory : process.cwd();
            const watching = this.script.watch.map((p) => path.join(baseDir, p));
            this.watcher = watch(watching, { recursive: true,  }, async () => {
                if (this.processLock.isAvailable()) {
                    this.print("Restarting due to file change\n");
                    this.start();
                }
            });
        }
    }

    public async start() {
        const release = await this.processLock();

        await this.kill();
        const proc = this._start();
        proc.on("close", this.onClose);
        this.proc = proc;

        this.startWatching();
        release();
    }

    public async kill() {
        const proc = this.proc;
        if (proc === undefined) return;

        proc.off("close", this.onClose);
        const deathPromise = new Promise<void>((resolve) => {
            proc.on("close", () => resolve())
            killWithSignal(proc.pid, 15 /* SIGTERM */);
        });
        (async () => {
            await sleep(2000);
            if (this.proc === proc) {
                killWithSignal(proc.pid, 9 /* SIGKILL */);
            }
        })();
        await deathPromise;

        this.proc = undefined;
    }
}
