---
layout: page
title: 홈
permalink: /
---

<section class="landing-hero">
  <div class="landing-copy">
    <p class="landing-eyebrow">Security research archive</p>
    <h1>gyue</h1>
    <p class="landing-summary">
      웹 보안과 문제 해결 과정을 차분하게 축적하는 개인 아카이브입니다.
    </p>
    <p class="landing-detail">
      개발 기록부터 CTF/Wargame, BugBounty, 기술문서, 논문/컨퍼런스, 공모전/자격증까지
      공부한 내용을 다시 꺼내볼 수 있는 형태로 정리합니다.
    </p>
    <div class="landing-actions">
      <a class="landing-button primary" href="{{ '/archives/' | relative_url }}">최근 글 보기</a>
      <a class="landing-button" href="{{ '/about/' | relative_url }}">소개 보기</a>
    </div>
  </div>

  <aside class="landing-panel">
    <p class="panel-label">Focus</p>
    <ul class="panel-list">
      <li>Web Hacking</li>
      <li>CTF &amp; Wargame</li>
      <li>BugBounty</li>
    </ul>
    <p class="panel-caption">
      실습 과정, 분석 메모, 기술 문서를 한곳에 모아두는 블로그입니다.
    </p>
  </aside>
</section>

<section class="landing-section">
  <div class="section-heading">
    <p class="section-kicker">Categories</p>
    <h2>기록하는 주제</h2>
  </div>

  <div class="category-grid">
    <a class="category-card" href="{{ '/categories/' | relative_url }}">
      <span class="category-index">01</span>
      <h3>개발</h3>
      <p>개발 과정에서 정리할 만한 설계, 구현, 학습 노트를 남깁니다.</p>
    </a>

    <a class="category-card" href="{{ '/categories/' | relative_url }}">
      <span class="category-index">02</span>
      <h3>CTF / Wargame</h3>
      <p>문제 풀이 흐름과 핵심 개념을 복기할 수 있도록 기록합니다.</p>
    </a>

    <a class="category-card" href="{{ '/categories/' | relative_url }}">
      <span class="category-index">03</span>
      <h3>BugBounty</h3>
      <p>취약점 분석 과정, 재현 실험, 실전 학습 포인트를 정리합니다.</p>
    </a>

    <a class="category-card" href="{{ '/categories/' | relative_url }}">
      <span class="category-index">04</span>
      <h3>블로그 / 기술문서</h3>
      <p>운영 기록과 문서화 방식, 참고할 만한 기술 자료를 모읍니다.</p>
    </a>

    <a class="category-card" href="{{ '/categories/' | relative_url }}">
      <span class="category-index">05</span>
      <h3>논문 / 컨퍼런스</h3>
      <p>논문과 발표 자료에서 얻은 인사이트를 요약해 저장합니다.</p>
    </a>

    <a class="category-card" href="{{ '/categories/' | relative_url }}">
      <span class="category-index">06</span>
      <h3>공모전 / 자격증</h3>
      <p>준비 과정과 회고를 남겨 다음 도전에 바로 활용할 수 있게 합니다.</p>
    </a>
  </div>
</section>

<section class="landing-section">
  <div class="section-heading">
    <p class="section-kicker">Recent posts</p>
    <h2>최근에 정리한 글</h2>
  </div>

  <div class="post-stack">
    {% for post in site.posts limit:4 %}
      <a class="post-card" href="{{ post.url | relative_url }}">
        <p class="post-meta">{{ post.date | date: "%Y.%m.%d" }}</p>
        <h3>{{ post.title }}</h3>
        {% assign excerpt_text = post.excerpt | strip_html | strip_newlines | truncate: 120 %}
        <p>{{ excerpt_text }}</p>
      </a>
    {% endfor %}
  </div>
</section>

<section class="landing-section landing-footer">
  <div class="contact-card">
    <p class="section-kicker">Contact</p>
    <h2>Connect</h2>
    <p>
      GitHub Pages 기반으로 운영 중이며, 기술 기록과 보안 학습 메모를 꾸준히 업데이트합니다.
    </p>
    <div class="contact-links">
      <a href="https://github.com/gyuesecurity">GitHub</a>
      <a href="mailto:sos004989@naver.com">sos004989@naver.com</a>
    </div>
  </div>
</section>
