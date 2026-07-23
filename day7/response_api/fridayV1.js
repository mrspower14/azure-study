import readline from "readline";
import dotenv from "dotenv";
import { OpenAI } from "openai";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";

// Load environment variables
dotenv.config();

// Read configuration
const azureOpenAIEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const modelDeployment = process.env.MODEL_DEPLOYMENT;

// Clear console
console.clear();

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Helper function for prompt
function ask(question) {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
}

async function main() {
    try {
        // Create Microsoft Entra ID token provider
        const tokenProvider = getBearerTokenProvider(
            new DefaultAzureCredential(),
            "https://ai.azure.com/.default"
        );

        // Initialize OpenAI client
        const client = new OpenAI({
            baseURL: azureOpenAIEndpoint,
            apiKey: tokenProvider
        });

        let lastResponseId = null;

        while (true) {
            const input = await ask('\n프롬프트를 입력하세요 (종료하려면 "quit" 입력): ');

            if (input.toLowerCase() === "quit") {
                break;
            }

            if (input.trim().length === 0) {
                console.log("프롬프트를 입력하세요.");
                continue;
            }

            const response = await client.responses.create({
                model: modelDeployment,
                instructions:
                    "You are a helpful AI assistant that answers questions and provides information.",
                input: input,
                previous_response_id: lastResponseId
            });

            console.log(response.output_text);

            lastResponseId = response.id;
        }

        rl.close();
    }
    catch (err) {
        console.error(err);
        rl.close();
    }
}

main();