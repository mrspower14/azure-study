# 1. 공식 Nginx 이미지를 베이스로 사용
FROM nginx

# 2. 로컬의 빌드된 정적 파일들을 Nginx의 기본 HTML 디렉토리로 복사
COPY . /usr/share/nginx/html

# 3. 80번 포트 개방
EXPOSE 80

# 4. Nginx 백그라운드 실행 방지 (컨테이너가 종료되지 않도록 함)
CMD ["nginx", "-g", "daemon off;"]