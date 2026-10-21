package com.mark.appeal.records;

import static org.assertj.core.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.Test;

class IpRulesTest {
  @Test
  void normalizesShortNetworksAndKeepsCidrText() {
    assertThat(IpRules.normalize("209.166.41")).isEqualTo("209.166.41.0/24");
    assertThat(IpRules.normalize("194.179.156.0/24")).isEqualTo("194.179.156.0/24");
    assertThatThrownBy(() -> IpRules.normalize("999.1.1")).isInstanceOf(RuntimeException.class);
  }

  @Test
  void containsUsesPrefixWithoutDns() {
    assertThat(IpRules.contains("198.65.111.0/24", "198.65.111.37")).isTrue();
    assertThat(IpRules.contains("198.65.111.0/24", "198.65.112.37")).isFalse();
    assertThat(IpRules.contains("2001:db8::/32", "2001:db8::1")).isTrue();
    assertThat(IpRules.valid("localhost")).isFalse();
  }

  @Test
  void importUsesFirstContainingNetworkAndLastLineWins() {
    var r =
        IpRules.importCredentials(
            List.of("198.65.0.0/16", "198.65.111.0/24"),
            "198.65.111.1:1234:u:p\\\n198.65.111.2:5678:u:q\ninvalid\n1.1.1.1:80:u:p");
    assertThat(r.assignments()).containsEntry("198.65.0.0/16", "198.65.111.2:5678:u:q").hasSize(1);
    assertThat(r.invalidLines()).containsExactly(3);
    assertThat(r.unmatchedLines()).containsExactly(4);
  }

  @Test
  void terminalStatusIsNotChangedByChecks() {
    assertThat(IpRules.deriveStatus("申诉成功", true)).isEqualTo("申诉成功");
    assertThat(IpRules.deriveStatus("准备中", true)).isEqualTo("部分完成");
    assertThat(IpRules.deriveStatus("部分完成", false)).isEqualTo("准备中");
  }
}
