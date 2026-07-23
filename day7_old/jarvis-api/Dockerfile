# 1. Node.js 22 LTS 공식 이미지를 기반으로 설정 (경량 alpine 버전)
FROM node:22-alpine

# 2. 컨테이너 내 작업 디렉토리 생성 및 설정
WORKDIR /usr/src/app

# 3. 의존성 정의 파일 복사
COPY package*.json ./

# 4. 의존성 패키지 설치
RUN npm install

# 5. 전체 소스 코드 복사
COPY . .

# 6. 애플리케이션이 사용하는 포트 명시 (코드의 3000번 포트)
EXPOSE 3000

# 7. 컨테이너 시작 시 실행할 명령어
CMD [ "node", "server.js" ]