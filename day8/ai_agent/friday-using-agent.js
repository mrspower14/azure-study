import fs from "fs";
import path from "path";
import readline from "readline";
import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";
import dotenv from "dotenv";

dotenv.config();

const OUTPUT_DIR = "agent_outputs";
let credential;

function getOutputPath(filename) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const baseName = path.basename(filename);
  const stem = path.parse(baseName).name || "output";
  const suffix = path.parse(baseName).ext;
  let outputPath = path.join(OUTPUT_DIR, baseName);

  let counter = 1;
  while (fs.existsSync(outputPath)) {
    outputPath = path.join(OUTPUT_DIR, `${stem}_${counter}${suffix}`);
    counter++;
  }

  return outputPath;
}

function saveBytes(fileBytes, filename) {
  const outputPath = getOutputPath(filename);
  fs.writeFileSync(outputPath, fileBytes);
  return outputPath;
}

function saveImage(imageData, filename) {
  return saveBytes(Buffer.from(imageData, "base64"), filename);
}

async function downloadContainerFile(openaiClient, annotation, downloadedFiles) {
  const cacheKey = `${annotation.container_id}::${annotation.file_id}`;
  if (downloadedFiles.has(cacheKey)) {
    return downloadedFiles.get(cacheKey);
  }

  const fileContent = await openaiClient.containers.files.content.retrieve(
    annotation.file_id,
    { container_id: annotation.container_id }
  );

  const buffer = Buffer.from(await fileContent.arrayBuffer());
  const outputPath = saveBytes(
    buffer,
    annotation.filename || `${annotation.file_id}.bin`
  );

  downloadedFiles.set(cacheKey, outputPath);
  return outputPath;
}

async function formatOutputText(contentItem, openaiClient, downloadedFiles) {
  let text = contentItem.text || "";
  const replacements = [];
  const referencedFiles = new Set();

  for (const annotation of contentItem.annotations || []) {
    if (annotation.type !== "container_file_citation") continue;

    const outputPath = await downloadContainerFile(
      openaiClient,
      annotation,
      downloadedFiles
    );
    const replacementText = `${annotation.filename} (saved to ${outputPath})`;
    referencedFiles.add(outputPath);

    const startIndex = annotation.start_index ?? null;
    const endIndex = annotation.end_index ?? null;

    if (startIndex !== null && endIndex !== null) {
      replacements.push({ startIndex, endIndex, replacementText });
      continue;
    }

    const annotatedText = annotation.text || "";
    if (annotatedText) {
      text = text.replaceAll(annotatedText, replacementText);
    }
  }

  replacements.sort((a, b) => b.startIndex - a.startIndex);
  for (const { startIndex, endIndex, replacementText } of replacements) {
    text = text.slice(0, startIndex) + replacementText + text.slice(endIndex);
  }

  return { text, referencedFiles };
}

async function main() {
  const projectEndpoint = process.env.PROJECT_ENDPOINT;
  const agentName = process.env.AGENT_NAME || "aiinfra-agent";
  const modelName = process.env.AGENT_MODEL || "gpt-5-mini";
  const apiVersion = process.env.API_VERSION || "2025-05-15-preview";

  if (!projectEndpoint) {
    console.error("에러: PROJECT_ENDPOINT 환경변수가 설정되지 않았습니다.");
    console.error(".env 파일의 환경변수를 설정해주세요");
    return;
  }

  console.log("Microsoft Foundry 프로젝트 연결...");
  credential = new DefaultAzureCredential();
  const projectClient = new AIProjectClient(projectEndpoint, credential);

  const openaiClient = await projectClient.getOpenAIClient();

  console.log(`에이전트 로딩: ${agentName}`);
  const agent = await projectClient.agents.get(agentName);
  console.log(`에이전트에 연결: ${agent.name} (id: ${agent.id})`);

  const conversation = await openaiClient.conversations.create({ items: [] });
  console.log(`대화 생성 (id: ${conversation.id})`);

  console.log("\n" + "=".repeat(60));
  console.log("AI 인프라 에이전트 준비됨!");
  console.log("질문을 하거나, 데이터 분석을 요청하거나, 도움을 받으세요");
  console.log("종료하려면 'exit'를 입력하세요");
  console.log("=".repeat(60) + "\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (prompt) =>
    new Promise((resolve) => rl.question(prompt, resolve));

  while (true) {
    const userInput = (await askQuestion("You: ")).trim();

    if (["exit", "quit", "bye"].includes(userInput.toLowerCase())) {
      console.log("Goodbye!");
      rl.close();
      break;
    }

    if (!userInput) continue;

    await openaiClient.conversations.items.create(conversation.id, {
      items: [{ type: "message", role: "user", content: userInput }],
    });

    console.log("\n[에이전트가 추론 중...]");

    // Azure 인증 토큰 획득
    const tokenResponse = await credential.getToken(
      "https://ai.azure.com/.default"
    );

    // Azure AI Foundry Responses API 직접 호출
    const res = await fetch(
      `${projectEndpoint}/openai/responses?api-version=${apiVersion}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenResponse.token}`,
        },
        body: JSON.stringify({
          model: modelName,
          conversation: conversation.id,
          input: "",
          agent_reference: { name: agent.name, type: "agent_reference" },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Azure API 오류 ${res.status}: ${errText}`);
    }

    const response = await res.json();

    let handledOutput = false;
    const downloadedFiles = new Map();
    const referencedFiles = new Set();
    let imageCount = 0;

    if (response.output?.length) {
      for (const item of response.output) {
        const itemType = item.type || "";

        if (itemType === "message" && item.content?.length) {
          for (const contentItem of item.content) {
            if (contentItem.type !== "output_text") continue;

            const { text: formattedText, referencedFiles: messageFiles } =
              await formatOutputText(contentItem, openaiClient, downloadedFiles);

            for (const f of messageFiles) referencedFiles.add(f);

            if (formattedText) {
              console.log(`\nAgent: ${formattedText}\n`);
              handledOutput = true;
            }
          }
        } else if (item.text) {
          console.log(`\nAgent: ${item.text}\n`);
          handledOutput = true;
        } else if (itemType === "image") {
          imageCount++;
          const filename = `chart_${imageCount}.png`;

          if (item.image?.data) {
            const filePath = saveImage(item.image.data, filename);
            console.log(`\n[Agent가 차트를 생성했습니다 - 저장 위치: ${filePath}]`);
          } else {
            console.log("\n[Agent가 이미지를 생성했습니다]");
          }
          handledOutput = true;
        }
      }

      for (const [, filePath] of downloadedFiles) {
        if (!referencedFiles.has(filePath)) {
          console.log(`\n[Agent가 파일을 생성했습니다 - 저장 위치: ${filePath}]`);
          handledOutput = true;
        }
      }
    }

    if (!handledOutput && response.output_text) {
      console.log(`\nAgent: ${response.output_text}\n`);
    }
  }
}

main().catch((err) => {
  console.error("실행 중 오류 발생:", err);
  process.exit(1);
});