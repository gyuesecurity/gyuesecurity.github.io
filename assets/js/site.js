(() => {
  const root = document.documentElement;
  const themeButton = document.querySelector('.theme-toggle');
  const themeLabel = document.querySelector('.theme-label');

  const renderTheme = () => {
    const dark = root.dataset.theme === 'dark';
    if (themeLabel) themeLabel.textContent = dark ? 'LIGHT' : 'DARK';
    if (themeButton) themeButton.setAttribute('aria-label', dark ? '밝은 테마로 전환' : '어두운 테마로 전환');
  };

  themeButton?.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('gyue-theme', root.dataset.theme);
    renderTheme();
  });
  renderTheme();

  const menuButton = document.querySelector('.menu-toggle');
  const menu = document.querySelector('.nav-cluster');
  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!open));
    menu?.classList.toggle('is-open', !open);
  });

  const progress = document.querySelector('.reading-progress');
  if (progress) {
    const updateProgress = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    };
    addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
  }

  const article = document.querySelector('.article-body');
  if (!article) return;

  const duplicateTitle = article.querySelector(':scope > h1:first-child');
  duplicateTitle?.remove();

  const words = article.textContent.trim().split(/\s+/).filter(Boolean).length;
  const readingTime = document.querySelector('[data-reading-time]');
  if (readingTime) readingTime.textContent = `${Math.max(1, Math.ceil(words / 300))} MIN READ`;

  const toc = document.getElementById('article-toc');
  const tocList = document.getElementById('article-toc-list');
  const headings = [...article.querySelectorAll('h2, h3')];
  if (toc && tocList && headings.length >= 3) {
    headings.forEach((heading, index) => {
      if (!heading.id) heading.id = `section-${index + 1}`;
      const item = document.createElement('li');
      if (heading.tagName === 'H3') item.className = 'toc-subitem';
      const link = document.createElement('a');
      link.href = `#${heading.id}`;
      link.textContent = heading.textContent;
      item.appendChild(link);
      tocList.appendChild(item);
    });
    toc.hidden = false;
  }

  article.querySelectorAll('.highlight > pre.highlight').forEach((block) => {
    const button = document.createElement('button');
    button.className = 'copy-code';
    button.type = 'button';
    button.textContent = 'COPY';
    button.addEventListener('click', async () => {
      const source = block.querySelector('.rouge-code pre, code');
      await navigator.clipboard.writeText(source?.textContent || block.textContent);
      button.textContent = 'COPIED';
      setTimeout(() => { button.textContent = 'COPY'; }, 1400);
    });
    block.appendChild(button);
  });
})();
