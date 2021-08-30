import * as internal from "stream";

import type { Locator, Project } from "@yarnpkg/core";
import * as scriptUtils from "@yarnpkg/core/lib/scriptUtils";

import { WorkspaceScripts, Script, OnExit } from "./parseScripts";

export interface ResolvedScriptSimple {
    kind: "resolved";
    workingDirectory: string;
    watch: string[];
    onExit?: OnExit;
    script: string;
}

export interface UnresolvedScriptSimple {
    kind: "unresolved";
    watch: string[];
    onExit?: OnExit;
    command: string;
}

export type ScriptSimple = ResolvedScriptSimple | UnresolvedScriptSimple;

export type ExecutableScript = ScriptSimple | ScriptSimple[];

export interface Stdio {
    stdout: internal.Writable;
    stderr: internal.Writable;
    stdin: internal.Readable;
}

export interface IncomingStdio {
    stdout: internal.Readable;
    stderr: internal.Readable;
    stdin: internal.Writable;
}

export interface FakeStdio {
    stdout: "pipe";
    stderr: "pipe";
    stdin: "pipe";
}

function recursivelyApplyOptions (watch: string[], onExit: OnExit | undefined, script: ScriptSimple): ScriptSimple;
function recursivelyApplyOptions (watch: string[], onExit: OnExit | undefined, script: ScriptSimple[]): ScriptSimple[];
function recursivelyApplyOptions (watch: string[], onExit: OnExit | undefined, script: ExecutableScript): ExecutableScript;
function recursivelyApplyOptions (watch: string[], onExit: OnExit | undefined, script: ExecutableScript): ExecutableScript {
    if (Array.isArray(script)) {
        return script.map((s) => recursivelyApplyOptions(watch, onExit, s));
    }

    return {
        ...script,
        watch: script.watch.concat(watch),
        onExit: script.onExit ?? onExit,
    }
}

function flatten(scripts: ExecutableScript[]): ScriptSimple[] {
    const result: ScriptSimple[] = [];
    for (const script of scripts) {
        if (Array.isArray(script)) {
            result.push(...script);
        } else {
            result.push(script);
        }
    }

    return result;
}

function resolveSingle (script: Script, scripts: WorkspaceScripts): ExecutableScript {
    switch (script.kind) {
        case "shell-script": {
            return {
                kind: "resolved",
                watch: script.watch ?? [],
                workingDirectory: script.workingDirectory,
                script: script.value,
                onExit: script.onExit,
            };
        }
        case "script-reference": {
            const resolved = resolveScript(script.scriptName, script.packageName, scripts);
            if (!resolved) {
                return {
                    kind: "unresolved",
                    command: script.scriptName,
                    watch: script.watch ?? [],
                    onExit: script.onExit,
                };
            }

            return recursivelyApplyOptions(script.watch ?? [], script.onExit, resolved);
        }
        case "script-sequence": {
            const resolvedScripts = script.scripts
                .map((s) => resolveSingle(s, scripts))
                .filter((s): s is ExecutableScript => s !== undefined)
                .map((s) => recursivelyApplyOptions(script.watch ?? [], script.onExit, s))

            return flatten(resolvedScripts);
        }
    }
}

function resolveScript (scriptName: string, pkg: string | undefined, scripts: WorkspaceScripts): ExecutableScript {
    const foundScripts = scripts.get(scriptName);
    if (!foundScripts) {
        return {
            kind: "unresolved",
            command: scriptName,
            watch: [],
        };
    }

    // TODO: Choose based off of cwd
    const first = pkg ? foundScripts.get(pkg) : [...foundScripts.values()][0];
    if (!first) {
        return {
            kind: "unresolved",
            command: scriptName,
            watch: [],
        };
    }

    return resolveSingle(first, scripts);
}

export const resolveAndExecuteCommand = async (command: string, args: string[], scripts: WorkspaceScripts, locator: Locator, project: Project, stdio: Stdio) => {
    const resolved = resolveScript(command, undefined, scripts);
    const asArray = flatten([resolved]);

    const commands = asArray
        .map((x) => ["--command", JSON.stringify(x)])
        .reduce((acc, x) => [...acc, ...x], ["_r_internal_1", "--args", JSON.stringify(args)]);

    scriptUtils.executePackageShellcode(
        locator,
        "yarn",
        commands,
        { project, ...stdio }
    );
}