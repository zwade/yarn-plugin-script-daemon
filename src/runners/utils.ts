import { ChildProcess } from "child_process";
import { FSWatcher } from "fs";
import watch from "node-watch";
import { ScriptSimple } from "../commandExecution";
import { sleep } from "../utils";


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
        return (
            this.script.kind === "resolved" ? "/bin/sh" :
            this.script.command
        );
    }

    protected get args() {
        return (
            this.script.kind === "resolved" ? ["-c", this.script.script + " " + this.additionalArgs.join(" ")] :
            this.additionalArgs
        )
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
            this.watcher = watch(this.script.watch, { recursive: true }, async () => {
                this.print("Restarting due to file change\n");
                this.start();
            });
        }
    }

    public async start() {
        await this.kill();
        const proc = this._start();
        proc.on("close", this.onClose);
        this.proc = proc;

        this.startWatching();
    }

    public async kill() {
        const proc = this.proc;
        if (proc === undefined) return;

        proc.off("close", this.onClose);
        const deathPromise = new Promise<void>((resolve) => {
            this.print("trying to close");
            proc.on("close", () => { resolve(); this.print("closed") })
            proc.kill("SIGINT");
        });
        (async () => {
            await sleep(2000);
            if (this.proc === proc) {
                proc.kill("SIGKILL");
            }
        })();
        await deathPromise;

        this.proc = undefined;
    }
}
