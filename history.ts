import type { BunFile } from "bun";
import { appendFile } from "node:fs";
import * as readline from "readline";
import { convertBunReadableToNodeReadable } from "./util";

export class History {
    #PATH: string = "hsh_history";
    #history: BunFile;

    constructor() {
        this.#history = Bun.file(this.#PATH);
    }

    push(line: string) {
        appendFile(this.#PATH, `${line}\n`, (err) => {
            if (err) {
                throw new Error(err.message);
            }
        });
    }

    showHistory(output: "pipe" | "stdout"): ReadableStream | undefined {
        var history = readline.createInterface({
            input: convertBunReadableToNodeReadable(this.#history.stream()),
        });

        let lineNo = 0;
        if (output === "stdout") {
            history.on("line", function (line: string) {
                process.stdout.write(`${lineNo + 1} ${line}\n`);
                lineNo++;
            });
        } else {
            return new ReadableStream({
                start(controller) {
                    history.on("line", (line: string) => {
                        controller.enqueue(`${lineNo + 1} ${line}\n`);
                        lineNo++;
                    });

                    history.on("close", () => {
                        controller.close();
                    });
                },
            });
        }
    }
}
