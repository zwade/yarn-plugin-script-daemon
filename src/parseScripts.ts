import type { Manifest } from "@yarnpkg/core";
import { M, marshal, MarshalError } from "@zensors/sheriff";

export type OnExit = "wait" | "kill" | "restart";

export type ScriptDefinition =
    | string
    | `r:${string}`
    | `r:${string}->${string}`
    | ScriptDefinition[]
    | { watch?: string[], onExit?: OnExit, script: ScriptDefinition }
    ;

export type R = { [key: string]: ScriptDefinition };

export type ScriptType =
    | { kind: "shell-script", value: string }
    | { kind: "script-reference", scriptName: string, packageName?: string }
    | { kind: "script-sequence", scripts: Script[] }
    ;

export type Script = ScriptType & { watch?: string[], onExit?: OnExit };

export type ScriptName = string;
export type PackageName = string;
export type WorkspaceScripts = Map<ScriptName, Map<PackageName, Script>>;

const MOnExit = M.union(M.lit("wait"), M.lit("kill"), M.lit("restart"));
const MScriptDefinition = M.rec<ScriptDefinition>((self) => M.union(
    M.str,
    M.arr(self),
    M.obj({
        watch: M.opt(M.arr(M.str)),
        onExit: M.opt(MOnExit),
        script: self,
    })
));

const parseScript = (script: ScriptDefinition): Script | undefined => {
    if (typeof script === "string" && script.slice(0, 2) === "r:") {
        let [packageName, scriptName] = script.slice(2).split("->");

        if (scriptName === undefined) {
            return { kind: "script-reference", scriptName: packageName };
        } else {
            return { kind: "script-reference", packageName, scriptName };
        }
    } else if (typeof script === "string") {
        return { kind: "shell-script", value: script };
    } else if (Array.isArray(script)) {
        return {
            kind: "script-sequence",
            scripts: script
                .map(parseScript)
                .filter((x): x is Script => x !== undefined)
        };
    } else if (typeof script === "object") {
        const { watch, onExit, script: scriptDefinition } = script;
        const nestedScript = parseScript(scriptDefinition);
        if (nestedScript === undefined) {
            return undefined
        }

        return {
            ...nestedScript,
            watch,
            onExit,
        };
    } else {
        console.warn("Found invalid script definition", script);
        return undefined;
    }
}

const parseScripts = (scripts: R) => {
    const results = new Map<string, Script>();

    for (const name of Object.keys(scripts)) {
        const script = scripts[name];
        try {
            marshal(script, MScriptDefinition, name);
            const parsedScript = parseScript(script);
            if (parsedScript !== undefined) {
                results.set(name, parsedScript);
            }
        } catch (e) {
            if (e instanceof MarshalError) {
                console.warn(e.message);
            }
        }
    }

    return results;
}

export const loadScripts = (manifests: Manifest[]): WorkspaceScripts => {
    const results = new Map<string, Map<string, Script>>();

    for (const manifest of manifests) {
        const scripts = Object.assign({}, manifest.raw.scripts, manifest.raw.r) as R;

        for (const [scriptName, script] of parseScripts(scripts).entries()) {
            if (!results.has(scriptName)) {
                results.set(scriptName, new Map());
            }

            const packageName = (manifest.raw.name ?? "__unnamed") as string;

            results.get(scriptName)!.set(packageName, script);
        }
    }

    return results;
}