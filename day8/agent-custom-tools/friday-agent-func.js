import fs from "fs";
import path from "path";
import readline from "readline";
import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";
import dotenv from "dotenv";
import {
  nextVisibleEvent,
  calculateObservationCost,
  generateObservationReport,
} from "./functions.js";

dotenv.config();

// ── Azure Responses API 직접 호출 헬퍼 ──────────────────────────────────────
async function callResponsesApi(projectEndpoint, apiVersion, credential, body) {
  const tokenResponse = await credential.getToken(
    process.env.AZURE_TOKEN_SCOPE || "https://ai.azure.com/.default"
  );

  const res = await fetch(
    `${projectEndpoint}/openai/responses?api-version=${apiVersion}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenResponse.token}`,
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Azure API 오류 ${res.status}: ${errText}`);
  }

  return res.json();
}

// ── 함수 디스패처 ────────────────────────────────────────────────────────────
function dispatchFunction(name, args) {
  const parsed = JSON.parse(args);
  switch (name) {
    case "next_visible_event":
      return nextVisibleEvent(parsed);
    case "calculate_observation_cost":
      return calculateObservationCost(parsed);
    case "generate_observation_report":
      return generateObservationReport(parsed);
    default:
      throw new Error(`알 수 없는 함수: ${name}`);
  }
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  // 콘솔 초기화
  console.clear();

  const projectEndpoint = process.env.PROJECT_ENDPOINT;
  const modelDeployment = process.env.MODEL_DEPLOYMENT_NAME;
  const apiVersion = process.env.API_VERSION || "2025-05-15-preview";

  if (!projectEndpoint || !modelDeployment) {
    console.error(
      "에러: PROJECT_ENDPOINT 또는 MODEL_DEPLOYMENT_NAME 환경변수가 설정되지 않았습니다."
    );
    process.exit(1);
  }

  const credential = new DefaultAzureCredential();
  const projectClient = new AIProjectClient(projectEndpoint, credential);
  const openaiClient = await projectClient.getOpenAIClient();

  // ── 함수 툴 정의 ────────────────────────────────────────────────────────────
  const eventTool = {
  type: "function",
  name: "next_visible_event",
  description: "Get the next visible event in a given location.",
  parameters: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description:
          "continent to find the next visible event in (e.g. 'north_america', 'south_america', 'australia')",
      },
    },
    required: ["location"],
    additionalProperties: false,
  },
  strict: true,
};

const costTool = {
  type: "function",
  name: "calculate_observation_cost",
  description:
    "Calculate the cost of an observation based on the telescope tier, number of hours, and priority level.",
  parameters: {
    type: "object",
    properties: {
      telescope_tier: {
        type: "string",
        description:
          "the tier of the telescope (e.g. 'standard', 'advanced', 'premium')",
      },
      hours: {
        type: "number",
        description: "the number of hours for the observation",
      },
      priority: {
        type: "string",
        description:
          "the priority level of the observation (e.g. 'low', 'normal', 'high')",
      },
    },
    required: ["telescope_tier", "hours", "priority"],
    additionalProperties: false,
  },
  strict: true,
};

const reportTool = {
  type: "function",
  name: "generate_observation_report",
  description: "Generate a report summarizing an astronomical observation",
  parameters: {
    type: "object",
    properties: {
      event_name: {
        type: "string",
        description: "the name of the astronomical event being observed",
      },
      location: {
        type: "string",
        description: "the location of the observer",
      },
      telescope_tier: {
        type: "string",
        description:
          "the tier of the telescope used for the observation (e.g. 'standard', 'advanced', 'premium')",
      },
      hours: {
        type: "number",
        description:
          "the number of hours the telescope was used for the observation",
      },
      priority: {
        type: "string",
        description:
          "the priority level of the observation (e.g. 'low', 'normal', 'high')",
      },
      observer_name: {
        type: "string",
        description: "the name of the person who conducted the observation",
      },
    },
    required: [
      "event_name",
      "location",
      "telescope_tier",
      "hours",
      "priority",
      "observer_name",
    ],
    additionalProperties: false,
  },
  strict: true,
};

// 에이전트 생성
const agent = await projectClient.agents.createVersion("astronomy-agent", {
  kind: "prompt",
  model: modelDeployment,
  instructions: `You are an astronomy observations assistant that helps users find 
information about astronomical events and calculate telescope rental costs. 
Use the available tools to assist users with their inquiries.`,
  tools: [eventTool, costTool, reportTool],  // ✅ 평탄한 구조로 직접 전달
});

  console.log(`에이전트 생성됨: ${agent.name} (버전: ${agent.version})`);

  // ── 대화 세션 생성 ──────────────────────────────────────────────────────────
  const conversation = await openaiClient.conversations.create();

  // 함수 호출 결과를 담을 목록
  let inputList = [];

  // ── readline 설정 ───────────────────────────────────────────────────────────
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (prompt) =>
    new Promise((resolve) => rl.question(prompt, resolve));

  // ── 대화 루프 ───────────────────────────────────────────────────────────────
  try {
    while (true) {
      const userInput = (
        await askQuestion(
          "Enter a prompt for the astronomy agent. Use 'quit' to exit.\nUSER: "
        )
      ).trim();

      if (userInput.toLowerCase() === "quit") {
        console.log("Exiting chat.");
        break;
      }

      if (!userInput) continue;

      // 사용자 메시지를 대화에 추가
      await openaiClient.conversations.items.create(conversation.id, {
        items: [{ type: "message", role: "user", content: userInput }],
      });

      // 에이전트 응답 요청 (함수 호출 포함 가능)
      let response = await callResponsesApi(
        projectEndpoint,
        apiVersion,
        credential,
        {
          model: modelDeployment,
          conversation: conversation.id,
          agent_reference: { name: agent.name, type: "agent_reference" },
          input: inputList,
        }
      );

      // 응답 실패 확인
      if (response.status === "failed") {
        console.error(`응답 실패: ${JSON.stringify(response.error)}`);
        continue;
      }

      // 함수 호출 처리
      inputList = [];
      for (const item of response.output || []) {
        if (item.type !== "function_call") continue;

        console.log(`[함수 호출] ${item.name}(${item.arguments})`);
        const result = dispatchFunction(item.name, item.arguments);

        inputList.push({
          type: "function_call_output",
          call_id: item.call_id,
          output: typeof result === "string" ? result : JSON.stringify(result),
        });
      }

      // 함수 결과가 있으면 다시 에이전트에 전달
      if (inputList.length > 0) {
        response = await callResponsesApi(
          projectEndpoint,
          apiVersion,
          credential,
          {
            model: modelDeployment,
            input: inputList,
            previous_response_id: response.id,
            agent_reference: { name: agent.name, type: "agent_reference" },
          }
        );
      }

      // 최종 응답 출력
      const outputText =
        response.output_text ||
        response.output
          ?.filter((i) => i.type === "message")
          ?.flatMap((i) => i.content || [])
          ?.filter((c) => c.type === "output_text")
          ?.map((c) => c.text)
          ?.join("\n") ||
        "(응답 없음)";

      console.log(`AGENT: ${outputText}`);
    }
  } finally {
    rl.close();

    // 에이전트 삭제
    await projectClient.agents.deleteVersion(agent.name, agent.version);
    console.log("에이전트가 삭제되었습니다.");
  }
}

main().catch((err) => {
  console.error("실행 중 오류 발생:", err);
  process.exit(1);
});