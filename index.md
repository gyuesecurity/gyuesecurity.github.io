---
layout: page
title: 홈
permalink: /
---

<div style="text-align:center; margin-top:40px; margin-bottom:50px;">

  <h1 style="font-size:44px; font-weight:800; margin-bottom:10px;">gyuesecurity</h1>

  <p style="font-size:17px; color:#9ca3af; margin-bottom:8px;">
    Web Hacking · CTF · Bug Bounty
  </p>

  <p style="font-size:15px; color:#d1d5db;">
    보안 공부하며 정리한 내용을 기록하는 블로그입니다.
  </p>

</div>

## Categories

<div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:20px; margin-top:20px;">

  <a href="/categories/개발/" style="text-decoration:none;">
    <div style="padding:22px; border:1px solid #2f3542; border-radius:14px; background:#111827;">
      <h3 style="margin-top:0; margin-bottom:10px;">개발</h3>
      <p style="margin:0; color:#9ca3af;">개발 관련 학습 내용을 정리합니다.</p>
    </div>
  </a>

  <a href="/categories/ctf-wargame/" style="text-decoration:none;">
    <div style="padding:22px; border:1px solid #2f3542; border-radius:14px; background:#111827;">
      <h3 style="margin-top:0; margin-bottom:10px;">CTF / Wargame</h3>
      <p style="margin:0; color:#9ca3af;">CTF 문제 풀이와 워게임 학습 내용을 기록합니다.</p>
    </div>
  </a>

  <a href="/categories/bugbounty/" style="text-decoration:none;">
    <div style="padding:22px; border:1px solid #2f3542; border-radius:14px; background:#111827;">
      <h3 style="margin-top:0; margin-bottom:10px;">BugBounty</h3>
      <p style="margin:0; color:#9ca3af;">버그바운티와 취약점 분석 기록을 정리합니다.</p>
    </div>
  </a>

  <a href="/categories/블로그-기술문서/" style="text-decoration:none;">
    <div style="padding:22px; border:1px solid #2f3542; border-radius:14px; background:#111827;">
      <h3 style="margin-top:0; margin-bottom:10px;">블로그 / 기술문서</h3>
      <p style="margin:0; color:#9ca3af;">블로그 운영 기록과 기술 문서를 정리합니다.</p>
    </div>
  </a>

  <a href="/categories/논문-컨퍼런스/" style="text-decoration:none;">
    <div style="padding:22px; border:1px solid #2f3542; border-radius:14px; background:#111827;">
      <h3 style="margin-top:0; margin-bottom:10px;">논문 / 컨퍼런스</h3>
      <p style="margin:0; color:#9ca3af;">논문, 세미나, 컨퍼런스 관련 내용을 기록합니다.</p>
    </div>
  </a>

  <a href="/categories/공모전-자격증/" style="text-decoration:none;">
    <div style="padding:22px; border:1px solid #2f3542; border-radius:14px; background:#111827;">
      <h3 style="margin-top:0; margin-bottom:10px;">공모전 / 자격증</h3>
      <p style="margin:0; color:#9ca3af;">공모전, 자격증, 대외활동 관련 내용을 정리합니다.</p>
    </div>
  </a>

</div>

<br><br>

## Recent Posts

<ul>
{% raw %}{% for post in site.posts limit:5 %}{% endraw %}
  <li style="margin-bottom:10px;">
    <a href="{% raw %}{{ post.url }}{% endraw %}">{% raw %}{{ post.title }}{% endraw %}</a>
    <span style="color:#9ca3af; font-size:14px;">- {% raw %}{{ post.date | date: "%Y-%m-%d" }}{% endraw %}</span>
  </li>
{% raw %}{% endfor %}{% endraw %}
</ul>

<br>

## Contact

- GitHub: [gyuesecurity](https://github.com/gyuesecurity)
- Email: example@email.com
