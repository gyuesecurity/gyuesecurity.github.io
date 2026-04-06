---
layout: page
title: 홈
permalink: /
---

<section class="landing-hero">
  <div class="landing-copy minimal">
    <p class="landing-eyebrow">GYUE SECURITY ARCHIVE</p>
    <h1>gyue</h1>
    <p class="landing-summary">
      웹 보안, 문제 풀이, 그리고 기술 문서를 오래 남는 기록으로 정리하는 블로그.
    </p>
    <p class="landing-detail">
      한 번 보고 지나가는 메모보다, 나중에 다시 읽었을 때 바로 흐름이 복원되는 글을 남기는 데
      더 집중합니다. 학습 과정과 시행착오를 덜어내지 않고 차근차근 축적합니다.
    </p>
    <div class="landing-links">
      <a href="{{ '/about/' | relative_url }}">About</a>
      <a href="{{ '/archives/' | relative_url }}">Archive</a>
      <a href="{{ '/categories/' | relative_url }}">Categories</a>
      <a href="mailto:sos004989@naver.com">Email</a>
    </div>
  </div>
</section>

<section class="landing-section compact">
  <div class="section-heading">
    <p class="section-kicker">Focus</p>
    <h2>기록하는 영역</h2>
  </div>

  <div class="category-list">
    <a class="category-row" href="{{ '/categories/' | relative_url }}">
      <span class="category-index">01</span>
      <h3>개발</h3>
      <p>설계, 구현, 학습 과정에서 남겨둘 만한 개발 기록.</p>
    </a>

    <a class="category-row" href="{{ '/categories/' | relative_url }}">
      <span class="category-index">02</span>
      <h3>CTF / Wargame</h3>
      <p>문제 풀이 흐름과 다시 복기할 핵심 아이디어.</p>
    </a>

    <a class="category-row" href="{{ '/categories/' | relative_url }}">
      <span class="category-index">03</span>
      <h3>BugBounty</h3>
      <p>취약점 분석, 재현 과정, 실전 학습 메모.</p>
    </a>

    <a class="category-row" href="{{ '/categories/' | relative_url }}">
      <span class="category-index">04</span>
      <h3>블로그 / 기술문서</h3>
      <p>운영 기록, 문서화 방식, 참고할 기술 자료 정리.</p>
    </a>

    <a class="category-row" href="{{ '/categories/' | relative_url }}">
      <span class="category-index">05</span>
      <h3>논문 / 컨퍼런스</h3>
      <p>논문과 발표 자료에서 건진 인사이트 요약.</p>
    </a>

    <a class="category-row" href="{{ '/categories/' | relative_url }}">
      <span class="category-index">06</span>
      <h3>공모전 / 자격증</h3>
      <p>준비 과정과 회고를 남기는 장기 기록.</p>
    </a>
  </div>
</section>

<section class="landing-section compact">
  <div class="section-heading">
    <p class="section-kicker">Recent Posts</p>
    <h2>최근 글</h2>
  </div>

  <div class="post-list-minimal">
    {% for post in site.posts limit:4 %}
      <a class="post-row" href="{{ post.url | relative_url }}">
        <p class="post-meta">{{ post.date | date: "%Y.%m.%d" }}</p>
        <div class="post-body">
          <h3>{{ post.title }}</h3>
        {% assign excerpt_text = post.excerpt | strip_html | strip_newlines | truncate: 120 %}
          <p>{{ excerpt_text }}</p>
        </div>
      </a>
    {% endfor %}
  </div>
</section>

<section class="landing-section compact landing-footer">
  <div class="contact-inline">
    <p class="section-kicker">Contact</p>
    <p>
      <a href="https://github.com/gyuesecurity">github.com/gyuesecurity</a>
      <span class="contact-sep">/</span>
      <a href="mailto:sos004989@naver.com">sos004989@naver.com</a>
    </p>
  </div>
</section>
