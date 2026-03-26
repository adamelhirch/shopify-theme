FROM ruby:3.2-alpine

WORKDIR /app

RUN apk add --no-cache dos2unix \
  && gem install webrick --no-document

COPY apps/reviews-service ./apps/reviews-service
COPY bin ./bin
COPY data ./data

ENV VD_REVIEWS_PORT=4567
ENV VD_REVIEWS_BIND=0.0.0.0

RUN find /app -type f \( -name "*.rb" -o -name "*.sh" \) -exec dos2unix {} \;

EXPOSE 4567

CMD ["ruby", "apps/reviews-service/server.rb"]
