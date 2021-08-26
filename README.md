# Script Daemon 😈

Write smarter yarn scripts without any additional dependencies.

## About

### Overview

At a high level, Script Daemon allows you to extend yarn's built-in script supoprt with additional features designed to keep scripts simple, while still working well together.

### Installation

To start using script daemon, make sure you're using yarn 2 or 3, and run

```bash
yarn plugin import https://raw.githubusercontent.com/zwade/yarn-plugin-script-daemon/master/bundles/%40yarnpkg/plugin-script-daemon.js
```

### Features

- ⛓️ Concurrency Support: Easily run multiple scripts in parallel and multiplex their output to the terminal.
- 👀 Watch Mode: Any script can be set up to watch a list of files or directories for changes.
- ➡️ Script References: Scripts can be referenced by name for easier composition.
- 🤝 Backward compatibility: Run normal yarn scripts without any changes.
- 📦 Self Contained: The plugin does not require any additional dependencies.

### Usage

Script Daemon looks at the scripts specified in the `scripts` section of your `package.json`, as well as a new section called `r`. Scripts in the `r` section have additional features. They can be specified as one of:

- Shell Script (e.g. `"echo hello world"`): This is the default behavior for yarn scripts, and is unchanged in script daemon.
- Script Reference (e.g. `"r:build"` or `r:@package/subpackage->build`): This lets you refer to scripts by name, optionally specifying a package name in which to look (in case of ambiguity).
- A Fully Specified Script (e.g. `{ "watch": ["./src"], "script": "r:build" }`): This lets you specify not only the script, but also additional options. These options include:
  - `script` (required): The script to run. This can be any of the other types of scripts.
  - `watch` (optional): A list of files to monitor.
  - `onExit` (optional): Behaviour for when the script exits. Valid options are `"kill"`, `"wait"`, and `"restart"`.
- A List of Scripts (e.g. `["echo hello world", { "watch": ["./src"], "script": "r:build" }]`): A list of several scripts that will be executed concurrently with one another.

To execute one of these scripts, just run `yarn r <script name>`.

Alternatively, if you ask it to run a command that is not explicitly in one of the `package.json` files, it will attempt to run it as a command in the yarn environment. For instance, run `yarn r env` to see the environment as run by script daemon.

## Examples

```json
{
    "scripts": {
        "build": "builder build plugin",
    },
    "r": {
        "test1": { "onExit": "wait",    "script": "sleep 1 && echo test1" },
        "test2": { "onExit": "restart", "script": "sleep 2 && echo test2" },
        "test3": { "onExit": "kill",    "script": "sleep 5 && echo test3" },
        "test4": "sleep 10 && echo 'test4 (failed)'",
        "test": [
            "r:test1",
            "r:test2",
            "r:test3",
            "r:test4"
        ],
        "build:watch": {
            "script": "builder build plugin",
            "watch": [
                "./src"
            ],
            "onExit": "wait"
        },
    }
}
```

## Contributions

Contributions are welcome. Before you write any code however, please file an issue to make sure the feature is something that works well with this plugin.

## Credits

- Zach Wade (@zwade)