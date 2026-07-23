import fs from "fs";
import path from "path";
import { DefaultAzureCredential } from "@azure/identity";
import { TextAnalyticsClient } from "@azure/ai-text-analytics";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  try {
    // 콘솔 초기화
    console.clear();

    // 환경변수 로드
    const foundryEndpoint = process.env.FOUNDRY_ENDPOINT;
    if (!foundryEndpoint) {
      throw new Error("FOUNDRY_ENDPOINT 환경변수가 설정되지 않았습니다.");
    }

    // 클라이언트 생성
    const credential = new DefaultAzureCredential();
    const aiClient = new TextAnalyticsClient(foundryEndpoint, credential);

    // reviews 폴더의 모든 파일 분석
    const reviewsFolder = "reviews";
    const files = fs.readdirSync(reviewsFolder);

    for (const fileName of files) {
        const filePath = path.join(reviewsFolder, fileName);

        // 파일 내용 읽기
        console.log("\n-------------\n" + fileName);
        const text = fs.readFileSync(filePath, "utf8");
        console.log("\n" + text);

        // 언어 감지
        const langResults = await aiClient.detectLanguage([text]);
        const detectedLanguage = langResults[0];
        if (!detectedLanguage.error) {
            console.log("\nLanguage: " + detectedLanguage.primaryLanguage.name);
        }

        // 엔티티 인식
        const entityResults = await aiClient.recognizeEntities([text]);
        const entities = entityResults[0];
        if (!entities.error && entities.entities.length > 0) {
            console.log("\nEntities");
            for (const entity of entities.entities) {
                console.log(`\t${entity.text} (${entity.category})`);
            }
        }

        // PII 엔티티 인식
        const piiResults = await aiClient.recognizePiiEntities([text]);
        const piiResult = piiResults[0];
        if (!piiResult.error && piiResult.entities.length > 0) {
            console.log("\nPII Entities");
            for (const piiEntity of piiResult.entities) {
                console.log(`\t${piiEntity.text} (${piiEntity.category})`);
            }
            console.log("Redacted Text:\n " + piiResult.redactedText);
        }
    }
  } catch (ex) {
    console.error(ex);
  }
}

main();