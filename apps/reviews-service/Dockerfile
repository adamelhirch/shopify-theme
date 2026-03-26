FROM ruby:3.2-alpine

WORKDIR /app

COPY apps/reviews-service ./apps/reviews-service
COPY bin ./bin
COPY data ./data

ENV VD_REVIEWS_PORT=4567

EXPOSE 4567

CMD ["ruby", "apps/reviews-service/server.rb"]
