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

  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('.spotlight').forEach((card) => {
      card.addEventListener('pointermove', (event) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
        card.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--spot-x', '50%');
        card.style.setProperty('--spot-y', '50%');
      });
    });
  }

  const search = document.getElementById('post-search');
  const categoryButtons = [...document.querySelectorAll('[data-category-filters] button')];
  const searchItems = [...document.querySelectorAll('[data-search-item]')];
  if (search && searchItems.length) {
    const count = document.getElementById('search-count');
    const empty = document.getElementById('search-empty');
    let category = '';
    const filterPosts = () => {
      const query = search.value.normalize('NFKC').trim().toLocaleLowerCase();
      let visible = 0;
      searchItems.forEach((item) => {
        const matchesText = !query || item.dataset.searchText.includes(query);
        const matchesCategory = !category || item.dataset.category === category;
        item.hidden = !(matchesText && matchesCategory);
        if (!item.hidden) visible += 1;
      });
      if (count) count.textContent = `${visible}개의 기록`;
      if (empty) empty.hidden = visible !== 0;
    };
    search.addEventListener('input', filterPosts);
    categoryButtons.forEach((button) => button.addEventListener('click', () => {
      category = button.dataset.category;
      categoryButtons.forEach((item) => item.classList.toggle('is-active', item === button));
      filterPosts();
    }));
    addEventListener('keydown', (event) => {
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
        event.preventDefault();
        search.focus();
      }
    });
  }

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
