---
layout: page
title: 홈
permalink: /
---

<div style="text-align:center; margin-top:40px; margin-bottom:50px;">

  <h1 style="font-size:44px; font-weight:800; margin-bottom:10px;">gyuesecurity</h1>

  <p style="font-size:17px; color:#94a3b8; margin-bottom:8px;">
    Web Hacking · CTF · Bug Bounty
  </p>

  <p style="font-size:15px; color:#cbd5e1;">
    보안 공부하며 정리한 내용을 기록하는 블로그입니다.
  </p>

</div>

## Categories

<div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:20px; margin-top:20px;">

  <a href="/categories/" style="text-decoration:none;">
    <div style="padding:22px; border:1px solid #243041; border-radius:14px; background:#0f172a;">
      <h3 style="margin-top:0; margin-bottom:10px; color:#f8fafc;">개발</h3>
      <p style="margin:0; color:#94a3b8;">개발 관련 학습 내용을 정리합니다.</p>
    </div>
  </a>

  <a href="/categories/" style="text-decoration:none;">
    <div style="padding:22px; border:1px solid #243041; border-radius:14px; background:#0f172a;">
      <h3 style="margin-top:0; margin-bottom:10px; color:#f8fafc;">CTF / Wargame</h3>
      <p style="margin:0; color:#94a3b8;">CTF 문제 풀이와 워게임 학습 내용을 기록합니다.</p>
    </div>
  </a>

  <a href="/categories/" style="text-decoration:none;">
    <div style="padding:22px; border:1px solid #243041; border-radius:14px; background:#0f172a;">
      <h3 style="margin-top:0; margin-bottom:10px; color:#f8fafc;">BugBounty</h3>
      <p style="margin:0; color:#94a3b8;">버그바운티와 취약점 분석 기록을 정리합니다.</p>
    </div>
  </a>

  <a href="/categories/" style="text-decoration:none;">
    <div style="padding:22px; border:1px solid #243041; border-radius:14px; background:#0f172a;">
      <h3 style="margin-top:0; margin-bottom:10px; color:#f8fafc;">블로그 / 기술문서</h3>
      <p style="margin:0; color:#94a3b8;">블로그 운영 기록과 기술 문서를 정리합니다.</p>
    </div>
  </a>

  <a href="/categories/" style="text-decoration:none;">
    <div style="padding:22px; border:1px solid #243041; border-radius:14px; background:#0f172a;">
      <h3 style="margin-top:0; margin-bottom:10px; color:#f8fafc;">논문 / 컨퍼런스</h3>
      <p style="margin:0; color:#94a3b8;">논문, 세미나, 컨퍼런스 관련 내용을 기록합니다.</p>
    </div>
  </a>

  <a href="/categories/" style="text-decoration:none;">
    <div style="padding:22px; border:1px solid #243041; border-radius:14px; background:#0f172a;">
      <h3 style="margin-top:0; margin-bottom:10px; color:#f8fafc;">공모전 / 자격증</h3>
      <p style="margin:0; color:#94a3b8;">공모전, 자격증, 대외활동 관련 내용을 정리합니다.</p>
    </div>
  </a>

</div>

<br><br>

## Recent Posts

<ul>
{% for post in site.posts limit:5 %}
  <li style="margin-bottom:10px;">
    <a href="{{ post.url }}">{{ post.title }}</a>
    <span style="color:#94a3b8; font-size:14px;">- {{ post.date | date: "%Y-%m-%d" }}</span>
  </li>
{% endfor %}
</ul>

<br>

## Contact

- GitHub: [gyuesecurity](https://github.com/gyuesecurity)
- Instagram [yh__1025](https://www.instagram.com/yh__1025/)
- Email: sos004989@naver.com
