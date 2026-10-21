package com.mark.appeal.common;

import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@RestControllerAdvice
public class ApiErrors {
  public static Map<String, Object> body(String code, String message) {
    return Map.of(
        "code",
        code,
        "message",
        message,
        "requestId",
        UUID.randomUUID().toString(),
        "details",
        Map.of());
  }

  @ExceptionHandler(ApiException.class)
  ResponseEntity<?> api(ApiException e) {
    return ResponseEntity.status(e.status).body(body(e.code, e.getMessage()));
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  ResponseEntity<?> relation() {
    return ResponseEntity.status(409).body(body("REFERENCE_CONFLICT", "数据关联或唯一性约束冲突"));
  }

  @ExceptionHandler({
    HttpMessageNotReadableException.class,
    MethodArgumentNotValidException.class,
    IllegalArgumentException.class
  })
  ResponseEntity<?> badInput() {
    return ResponseEntity.badRequest().body(body("VALIDATION_FAILED", "请求字段、格式或值不正确"));
  }

  @ExceptionHandler(AccessDeniedException.class)
  ResponseEntity<?> forbidden() {
    return ResponseEntity.status(403).body(body("FORBIDDEN", "无写入权限"));
  }

  @ExceptionHandler(MaxUploadSizeExceededException.class)
  ResponseEntity<?> large() {
    return ResponseEntity.status(413).body(body("PAYLOAD_TOO_LARGE", "文件超过允许大小"));
  }

  @ExceptionHandler({
    org.springframework.web.servlet.resource.NoResourceFoundException.class,
    org.springframework.web.servlet.NoHandlerFoundException.class
  })
  ResponseEntity<?> noRoute() {
    return ResponseEntity.status(404).body(body("NOT_FOUND", "接口不存在"));
  }

  @ExceptionHandler({
    org.springframework.web.bind.MissingServletRequestParameterException.class,
    org.springframework.web.multipart.support.MissingServletRequestPartException.class,
    org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class
  })
  ResponseEntity<?> missingInput() {
    return ResponseEntity.badRequest().body(body("VALIDATION_FAILED", "缺少参数或类型不正确"));
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<?> unknown() {
    return ResponseEntity.internalServerError().body(body("INTERNAL_ERROR", "服务暂时不可用，请核实操作结果"));
  }
}
