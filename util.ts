import type { Subprocess } from "bun";

export function createProcess(
    commands: string[],
    stdout: "pipe" | "inherit",
    stdin: any = undefined
): Subprocess {
    return Bun.spawn({
        cmd: commands,
        stdout,
        stdin,
        env: { ...Bun.env },
    });
}

export function handleError(error: unknown) {
    const err = error as Error;
    console.error(err.message);
}
