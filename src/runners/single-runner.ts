import { ChildProcess, spawn } from "child_process";

import { ScriptSimple, Stdio } from "../commandExecution";
import { CloseBehavior, Runner } from "./utils";

export class SingleRunner extends Runner {
    public _start() {
        return spawn(this.command, this.args, { stdio: "inherit" });
    }
}

export const singleExecute = async (script: ScriptSimple, args: string[]) => {
    const closeBehavior: CloseBehavior =
        script.onExit === "kill" ? { kind: "callback", onClose: () => { process.exit(0) } } :
        script.onExit === "restart" ? { kind: "restart" } :
        { kind: "wait" };

    const runner = new SingleRunner(
        script,
        args,
        closeBehavior,
        (msg: string) => {
            process.stdout.write(`[r] ${msg}`);
            return Promise.resolve()
        }
    );
    runner.start()
    return runner;
}