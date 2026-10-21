package com.mark.appeal.evidence;

import com.mark.appeal.common.ApiException;
import java.io.*;
import java.security.MessageDigest;
import java.util.*;
import javax.imageio.ImageIO;

public final class ImageContent {
  public static final int MAX_BYTES = 5 * 1024 * 1024;

  private ImageContent() {}

  public static String validate(byte[] bytes, String claimedType) {
    if (bytes.length == 0 || bytes.length > MAX_BYTES)
      throw new ApiException(413, "PAYLOAD_TOO_LARGE", "单张图片必须在 1 字节到 5 MiB 之间");
    try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
      var readers = ImageIO.getImageReaders(input);
      if (!readers.hasNext()) throw ApiException.invalid("无法识别图片内容");
      var reader = readers.next();
      try {
        reader.setInput(input, true, true);
        String mime =
            switch (reader.getFormatName().toLowerCase(Locale.ROOT)) {
              case "png" -> "image/png";
              case "jpeg", "jpg" -> "image/jpeg";
              case "gif" -> "image/gif";
              case "webp" -> "image/webp";
              default -> throw ApiException.invalid("支持 PNG/JPEG/GIF/WebP；旧文件其他格式需要先确认兼容方案");
            };
        if (!mime.equalsIgnoreCase(claimedType)) throw ApiException.invalid("图片类型与实际内容不一致");
        // Validate using a bounded decode, without narrowing the accepted image dimensions.
        long pixels = (long) reader.getWidth(0) * reader.getHeight(0);
        var params = reader.getDefaultReadParam();
        int sample = Math.max(1, (int) Math.ceil(Math.sqrt(pixels / 4_000_000.0)));
        params.setSourceSubsampling(sample, sample, 0, 0);
        if (reader.read(0, params) == null) throw ApiException.invalid("图片无法解码");
        return mime;
      } finally {
        reader.dispose();
      }
    } catch (IOException e) {
      throw ApiException.invalid("图片损坏或不支持");
    }
  }

  public static String sha256(byte[] bytes) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (java.security.NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}
