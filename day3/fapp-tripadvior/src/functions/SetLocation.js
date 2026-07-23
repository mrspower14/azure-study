const { app } = require('@azure/functions');

app.http('SetLocation', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        let name = request.query.get('name');

        if (!name) {
            try {
                const requestBody = await request.json();
                name = requestBody.name;
            } catch (error) {
                // JSON 파싱 실패 시 또는 name 필드가 없을 경우 기본값 처리 또는 에러 처리
                name = ''; // 또는 다른 기본값 할당 또는 에러 던지기
            }
        }

        if (!name || name.trim() === '') {
            return {
                status: 500,
                body: 'Error: "name" 파라미터가 제공되지 않았습니다.',
            };
        }

        return { body: `안녕하세요. ${name}를 희망 여행지로 등록했습니다.` };
    }
});
