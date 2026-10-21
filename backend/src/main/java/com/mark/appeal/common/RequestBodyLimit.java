package com.mark.appeal.common;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Type;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;

/** Bounds ordinary JSON bodies, including chunked requests; multipart uses separate limits. */
@ControllerAdvice
public class RequestBodyLimit extends RequestBodyAdviceAdapter {
  public static final int MAX_BYTES = 2 * 1024 * 1024;

  @Override
  public boolean supports(
      MethodParameter parameter,
      Type targetType,
      Class<? extends HttpMessageConverter<?>> converterType) {
    return parameter.hasParameterAnnotation(
        org.springframework.web.bind.annotation.RequestBody.class);
  }

  @Override
  public HttpInputMessage beforeBodyRead(
      HttpInputMessage message,
      MethodParameter parameter,
      Type targetType,
      Class<? extends HttpMessageConverter<?>> converterType)
      throws IOException {
    byte[] bytes = message.getBody().readNBytes(MAX_BYTES + 1);
    if (bytes.length > MAX_BYTES)
      throw new ApiException(413, "PAYLOAD_TOO_LARGE", "普通 JSON 请求最多 2 MiB");
    return new HttpInputMessage() {
      @Override
      public InputStream getBody() {
        return new ByteArrayInputStream(bytes);
      }

      @Override
      public HttpHeaders getHeaders() {
        return message.getHeaders();
      }
    };
  }
}
