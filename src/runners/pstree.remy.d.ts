declare module "pstree.remy" {
    type CB =
        ((err: null, pids: number[]) => void) &
        ((err: Error) => void);

    const _export: {
        hasPS: boolean;
    } & (
        (pid: number, cb: CB) => void
    );

    export = _export;
}