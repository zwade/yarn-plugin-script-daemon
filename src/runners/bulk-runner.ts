import { ChildProcessWithoutNullStreams, spawn } from "child_process";

import { ScriptSimple, Stdio } from "../commandExecution";
import { CloseBehavior, createLock, Runner } from "./utils";

export class BulkRunner extends Runner {
    public _start() {
        const proc = spawn(this.command, this.args, { cwd: this.cwd });
        proc.stdout.on("data", async (data) => {
            await this.print(data.toString());
        });

        proc.stderr.on("data", async (data) => {
            await this.print(data.toString());
        });

        return proc;
    }
}

export const getWrappedStdio = (base: Stdio) => {
    const lock = createLock();

    return (tag: string) => async (msg: string) => {
        const unlock = await lock();

        base.stdout.write(`${tag} ${msg}`);
        if (msg.slice(-1)[0] !== "\n") base.stdout.write("\n");

        unlock();
    }
}

export const bulkExecute = async (commands: ScriptSimple[], args: string[], stdio: Stdio) => {
    const wrappedStdio = getWrappedStdio(stdio);

    const processes = commands.map((script, id) => {
        const closeBehavior: CloseBehavior =
            script.onExit === "kill" ? { kind: "callback", onClose: () => { processes.forEach((p) => p.kill()) } } :
            script.onExit === "restart" ? { kind: "restart" } :
            { kind: "wait" };

        return new BulkRunner(script, args, closeBehavior, wrappedStdio(`[${id}]`));
    });

    for (const process of processes) {
        process.start();
    }

    return processes;
}