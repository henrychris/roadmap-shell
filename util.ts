import type { Subprocess } from "bun";
import { Transform } from "stream";

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

// sourced from: https://stackoverflow.com/a/77370169
export function convertBunReadableToNodeReadable(
    stream: ReadableStream
): Transform {
    const nodeStream = new Transform();

    stream.pipeTo(
        new WritableStream({
            write(value) {
                nodeStream.push(value);
            },
            close() {
                nodeStream.push(null);
            },
        })
    );

    return nodeStream;
}
