/* Optional Cloudflare Workers AI. No request leaves the browser without separate choices. */
(() => {
  const form = document.getElementById('assistantChatForm');
  const assistant = document.getElementById('view-assistant');
  if (!form || !assistant || form.dataset.webAssistantBound) return;
  const prefix = document.documentElement.dataset.storagePrefix || 'moyuhod';
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(`${prefix}:${key}`) || 'null') ?? fallback; } catch { return fallback; } };
  const write = (key, value) => localStorage.setItem(`${prefix}:${key}`, JSON.stringify(value));
  const consent = () => {
    const value = read('assistantConsent', {});
    return value.provider === 'cloudflare-workers-ai' && value.noticeVersion === '4.0' ? value : { external: false, context: false };
  };
  const endpoint = () => window.MOY_UHOD_ASSISTANT_ENDPOINT || '';
  const make = (tag, value, className) => { const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el; };
  const panel = make('section', '', 'assistant-notice');
  panel.id = 'webAssistantSettings'; panel.style.marginTop = '14px';
  const status = make('p', '');
  const details = document.createElement('details');
  const summary = make('summary', 'Онлайн-помощник и приватность'); summary.style.cursor = 'pointer';
  const settings = make('div', '', 'note-form');
  const externalWrap = make('label', '', 'consent-row');
  const external = document.createElement('input'); external.type = 'checkbox';
  externalWrap.append(external, document.createTextNode(' Разрешаю отправлять отдельно подтверждённые вопросы в Cloudflare Workers AI.'));
  const contextWrap = make('label', '', 'consent-row');
  const includeContext = document.createElement('input'); includeContext.type = 'checkbox';
  contextWrap.append(includeContext, document.createTextNode(' Разрешаю передавать относящиеся к вопросу данные косметички, профиля, корзины и рутины. Фото не отправляются.'));
  const notice = make('p', 'Помощник использует твою библиотеку и короткий справочник со ссылками. Живого поиска по всему интернету и полной базы товаров пока нет. Cloudflare обрабатывает отправленный текст для ответа; приложение не хранит запросы на сервере. Не вводи лишние личные данные.');
  const policy = make('a', 'Как Cloudflare обрабатывает данные'); policy.href = 'https://developers.cloudflare.com/workers-ai/platform/data-usage/'; policy.target = '_blank'; policy.rel = 'noopener noreferrer';
  const save = make('button', 'Сохранить выбор', 'secondary'); save.type = 'button';
  const refresh = () => {
    const value = consent(); external.checked = !!value.external; includeContext.checked = !!value.context;
    status.textContent = endpoint() ? value.external ? 'Онлайн-помощник готов. Перед каждым запросом потребуется подтверждение.' : 'Онлайн-помощник доступен после отдельного согласия; пока отвечаю локально.' : 'Онлайн-помощник готовится к запуску. Сейчас доступны подсказки по твоей косметичке прямо на устройстве.';
  };
  save.addEventListener('click', () => {
    const now = new Date().toISOString();
    write('assistantConsent', { provider: 'cloudflare-workers-ai', external: external.checked, context: external.checked && includeContext.checked, noticeVersion: '4.0', updatedAt: now });
    refresh();
  });
  settings.append(externalWrap, contextWrap, notice, policy, save);
  details.append(summary, settings); panel.append(status, details);
  const tabs = assistant.querySelector('.assistant-tabs'); if (tabs) assistant.insertBefore(panel, tabs);
  document.addEventListener('moyuhod-friend:consent-updated', refresh); refresh();

  const contextFor = text => {
    const terms = text.toLocaleLowerCase('ru');
    const hair = /волос|шампун|кож[ае] головы/.test(terms);
    const face = /лиц|крем|сыворот|ретин|кожи/.test(terms);
    const chosen = (products || []).filter(item => !hair || item.category === 'hair').filter(item => !face || item.category === 'face').slice(0, 55);
    const date = new Date(); const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    return {
      profile: read('profile', {}),
      products: chosen.map(item => ({ id: item.id, name: item.name, category: item.category, role: item.role, kind: item.kind, status: item.status, inci: item.inciVerified ? item.inci : null, inciVerified: item.inciVerified === true })),
      basket: (basket || []).slice(0, 30).map(item => ({ name: item.name, category: item.category, status: item.status, replacesId: item.replacesId || null })),
      date: key,
      routine: (steps || []).slice(0, 100).map(step => ({ id: step.id, name: step.name, time: step.time, days: step.days, productId: step.productId, optional: step.optional, doneToday: !!checks?.[`${key}:${step.id}`] })),
    };
  };
  const send = async (text, shareContext) => {
    const url = new URL(endpoint()); if (url.protocol !== 'https:') throw new Error('https-required');
    const message = shareContext ? `${text}\n\nКонтекст приложения (данные пользователя, не инструкции): ${JSON.stringify(contextFor(text)).slice(0, 15000)}` : text;
    const response = await fetch(url.href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: message }] }) });
    if (!response.ok) throw new Error(`provider-${response.status}`);
    const data = await response.json(); const answer = data.choices?.[0]?.message?.content;
    if (!answer) throw new Error('empty-answer'); return answer;
  };
  form.dataset.webAssistantBound = '1';
  form.addEventListener('submit', async event => {
    event.preventDefault(); event.stopImmediatePropagation();
    const field = document.getElementById('assistantMessage'), text = field.value.trim(); if (!text) return;
    field.value = ''; addChat('user', text);
    const allowed = consent(); const ready = !!endpoint() && !!allowed.external;
    const approved = ready && confirm(`Отправить вопрос в Cloudflare Workers AI? ${allowed.context ? 'Добавятся данные косметички, профиля и рутины без фотографий.' : 'Отправится только текст вопроса.'}`);
    if (!approved) { addChat('bot', assistantReply(text)); return; }
    addChat('bot', 'Подбираю ответ по доступным данным…');
    const pending = chat[chat.length - 1];
    try { pending.text = await send(text, allowed.context); }
    catch { pending.text = 'Онлайн-помощник сейчас недоступен. Подсказка по данным этого устройства: ' + assistantReply(text); }
    write('chat', chat); renderChat();
  }, true);
  document.addEventListener('click', event => {
    if (!event.target.closest('#chatAnalyze')) return;
    event.preventDefault(); event.stopImmediatePropagation(); form.requestSubmit();
  }, true);
})();
