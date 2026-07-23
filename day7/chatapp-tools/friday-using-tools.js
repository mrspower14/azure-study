import fs from "fs";
import path from "path";
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
    return new Promise(resolve => rl.question(question, resolve));
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

        //--------------------------------------------------
        // Create Vector Store
        //--------------------------------------------------

        console.log("벡터 저장소 생성 및 파일 업로드...");

        const vectorStore = await client.vectorStores.create({
            name: "travel-brochures"
        });

        //--------------------------------------------------
        // Upload PDF files
        //--------------------------------------------------

        const brochureFolder = "./brochures";

        const pdfFiles = fs
            .readdirSync(brochureFolder)
            .filter(file => file.toLowerCase().endsWith(".pdf"));

        if (pdfFiles.length === 0) {
            console.log("brochures 폴더에 PDF 파일이 없습니다.");
            return;
        }

        const fileStreams = pdfFiles.map(file =>
            fs.createReadStream(path.join(brochureFolder, file))
        );

        const fileBatch =
            await client.vectorStores.fileBatches.uploadAndPoll(
                vectorStore.id,
                {
                    files: fileStreams
                }
            );

        console.log(
            `Vector store created with ${fileBatch.file_counts.completed} files.`
        );

        //--------------------------------------------------
        // Conversation loop
        //--------------------------------------------------

        let lastResponseId = null;

        while (true) {

            const input = await ask('\n질문 입력 (종료는 "quit"): ');

            if (input.toLowerCase() === "quit")
                break;

            if (input.trim().length === 0) {
                console.log("질문을 입력하세요.");
                continue;
            }

            const response = await client.responses.create({

                model: modelDeployment,

                instructions: `
'마지스 트래블'에서 제공하는 여행 서비스에 대한 정보를 안내하는 여행 상담원입니다.
제공된 여행 브로셔를 활용하여 '마지스 트래블'이 제공하는 서비스에 대한 질문에 답변하십시오.
여행지에 대한 일반적인 정보나 최신 여행 관련 조언을 웹에서 검색하십시오.
`,

                input,

                previous_response_id: lastResponseId,

                tools: [
                    {
                        type: "file_search",
                        vector_store_ids: [vectorStore.id]
                    },
                    {
                        type: "web_search"
                    }
                ]
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