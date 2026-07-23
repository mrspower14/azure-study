import readline from "readline";
import dotenv from "dotenv";
import { OpenAI } from "openai";
import {
    DefaultAzureCredential,
    getBearerTokenProvider
} from "@azure/identity";

// Load environment variables
dotenv.config();

// Read configuration
const azureOpenAIEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const modelDeployment = process.env.MODEL_DEPLOYMENT;

// Clear console
console.clear();

// Readline
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
}

async function main() {
    try {
        // Microsoft Entra ID authentication
        const tokenProvider = getBearerTokenProvider(
            new DefaultAzureCredential(),
            "https://ai.azure.com/.default"
        );

        // OpenAI client
        const client = new OpenAI({
            baseURL: azureOpenAIEndpoint,
            apiKey: tokenProvider
        });

        // Track conversation
        let lastResponseId = null;

        while (true) {
            const input = await ask('\nEnter a prompt (or type "quit" to exit): ');

            if (input.toLowerCase() === "quit") {
                break;
            }

            if (input.trim().length === 0) {
                console.log("Please enter a prompt.");
                continue;
            }

            // Streaming response
            const stream = await client.responses.create({
                model: modelDeployment,
                instructions:
                    "You are a helpful AI assistant that answers questions and provides information.",
                input,
                previous_response_id: lastResponseId,
                stream: true
            });

            for await (const event of stream) {
                switch (event.type) {
                    case "response.output_text.delta":
                        process.stdout.write(event.delta);
                        break;

                    case "response.completed":
                        lastResponseId = event.response.id;
                        break;
                }
            }

            process.stdout.write("\n");
        }

        rl.close();
    } catch (err) {
        console.error(err);
        rl.close();
    }
}

main();