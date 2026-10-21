FROM maven:3.9-eclipse-temurin-26 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q -DskipTests package

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S appeal && adduser -S appeal -G appeal
WORKDIR /app
COPY --from=build --chown=appeal:appeal /build/target/appeal-backend-0.1.0.jar /app/app.jar
USER appeal
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "-jar", "/app/app.jar"]
