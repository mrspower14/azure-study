const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");
const http = require('http');
const url = require('url');
require("dotenv").config();

const endpoint = process.env["AZURE_OPENAI_ENDPOINT"];
const azureApiKey = process.env["AZURE_OPENAI_KEY"];

// 환경 변수 검증
if (!endpoint || !azureApiKey) {
    console.error("환경 변수가 설정되지 않았습니다:");
    console.error("AZURE_OPENAI_ENDPOINT:", endpoint ? "설정됨" : "누락");
    console.error("AZURE_OPENAI_KEY:", azureApiKey ? "설정됨" : "누락");
    process.exit(1);
}

// 서버 생성
const server = http.createServer(async (req, res) => {
    // CORS 헤더 추가 (모든 도메인에서 요청을 허용)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
   
    // OPTIONS 요청 처리 (CORS preflight 요청)
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // 요청 URL 분석
    const queryObject = url.parse(req.url, true).query;
    const pathname = url.parse(req.url, true).pathname;

    // "/api/ask" 경로로 요청이 올 경우 처리
    if (pathname === '/api/ask') {
        const prompt = queryObject.prompt;

        if (!prompt) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('prompt 파라미터가 필요합니다.');
            return;
        }

        try {
            console.log("== Chat Completions Sample ==");

            const client = new OpenAIClient(endpoint, new AzureKeyCredential(azureApiKey));
            const deploymentId = "jarvis";
            
            const result = await client.getChatCompletions(deploymentId, [
                { role: "system", content: "2008년에 개봉한 영화 아이언맨에 나오는 인공지능 자비스의 역할로서 질문에 답변해줘." },
                { role: "user", content: prompt }
            ]);

            for (const choice of result.choices) {
                console.log(choice.message);
            }

            // 응답
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(result.choices[0].message.content);

        } catch (error) {
            console.error('Azure OpenAI API 호출 중 오류:', error);
            
            // 오류 유형에 따른 응답
            if (error.status === 401) {
                res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('API 키가 올바르지 않습니다.');
            } else if (error.status === 404) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('배포 ID를 찾을 수 없습니다. deploymentId를 확인해주세요.');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('서버 오류가 발생했습니다.');
            }
        }

    } else {
        // 다른 경로로 접근할 경우
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('잘못된 경로입니다.');
    }
});

// 서버를 3000번 포트에서 실행
server.listen(3000, () => {
    console.log('자비스 오리진이 3000번 포트에서 실행 중입니다.');
});