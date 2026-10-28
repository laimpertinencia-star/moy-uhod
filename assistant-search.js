(() => {
  const form = document.getElementById('assistantChatForm');
  const assistant = document.getElementById('view-assistant');
  if (!form || !assistant || form.dataset.webAssistantBound) return;

  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(`moyuhod-friend:${key}`) || 'null') ?? fallback; }
    catch { return fallback; }
  };
  const config = read('assistantConfig', {});
  const consent = read('assistantConsent', { external: false, context: false });
  const make = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    return element;
  };

  const panel = make('section', '', 'assistant-notice');
  panel.id = 'webAssistantSettings';
  panel.style.marginTop = '14px';
  const status = make('p', config.endpoint && consent.external ? 'Веб-поиск готов. Вопрос отправляется только после подтверждения.' : 'Помощник пока работает локально. Подключи веб-поиск ниже, когда он понадобится.');
  const details = document.createElement('details');
  const summary = make('summary', 'Настроить веб-поиск и приватность');
  summary.style.cursor = 'pointer';
  const settings = make('div', '', 'note-form');
  const endpointLabel = make('label', 'Адрес защищённого сервера (HTTPS)');
  endpointLabel.htmlFor = 'webAssistantEndpoint';
  const endpoint = document.createElement('input');
  endpoint.id = 'webAssistantEndpoint'; endpoint.type = 'url'; endpoint.placeholder = 'https://…workers.dev/v1/chat/completions'; endpoint.value = config.endpoint || '';
  const externalWrap = make('label', ''); externalWrap.className = 'consent-row';
  const external = document.createElement('input'); external.type = 'checkbox'; external.checked = !!consent.external;
  externalWrap.append(external, document.createTextNode(' Разрешаю отправлять моё сообщение в OpenAI API через сервер приложения для веб-поиска.'));
  const contextWrap = make('label', ''); contextWrap.className = 'consent-row';
  const includeContext = document.createElement('input'); includeContext.type = 'checkbox'; includeContext.checked = !!consent.context;
  contextWrap.append(includeContext, document.createTextNode(' Разрешаю добавлять к вопросу подходящие средства из моей библиотеки и текущие шаги рутины.'));
  const notice = make('p', 'Сообщение и найденные источники обрабатываются внешним сервисом. Данные библиотеки и рутины отправляются только при отдельной отметке и только когда относятся к вопросу. API-данные OpenAI не используются для обучения по умолчанию; журналы безопасности могут храниться до 30 дней. Уже отправленные запросы нельзя удалить из внешней системы через приложение. Если ты находишься в России, до передачи профильных сведений проверь требования к локальному хранению и трансграничной передаче данных: эта настройка сама по себе их не заменяет.');
  const policy = make('a', 'Правила обработки данных OpenAI API'); policy.href = 'https://developers.openai.com/api/docs/guides/your-data'; policy.target = '_blank'; policy.rel = 'noopener noreferrer';
  const save = make('button', 'Сохранить настройки', 'secondary'); save.type = 'button';
  save.addEventListener('click', () => {
    const value = endpoint.value.trim();
    if (value) { try { if (new URL(value).protocol !== 'https:') throw new Error(); } catch { endpoint.focus(); status.textContent = 'Нужен корректный HTTPS-адрес защищённого сервера.'; return; } }
    localStorage.setItem('moyuhod-friend:assistantConfig', JSON.stringify({ endpoint: value, model: 'gpt-5.5' }));
    localStorage.setItem('moyuhod-friend:assistantConsent', JSON.stringify({ external: external.checked, context: includeContext.checked, updatedAt: new Date().toISOString() }));
    status.textContent = value && external.checked ? 'Веб-поиск готов. Вопрос отправляется только после подтверждения.' : 'Сохранено. Помощник продолжит работать локально, пока веб-поиск не разрешён и не настроен.';
  });
  settings.append(endpointLabel, endpoint, externalWrap, contextWrap, notice, policy, save);
  details.append(summary, settings); panel.append(status, details);
  const tabs = assistant.querySelector('.assistant-tabs');
  if (tabs) assistant.insertBefore(panel, tabs);

  document.addEventListener('moyuhod-friend:consent-updated', () => {
    const latestConsent = read('assistantConsent', {}), latestConfig = read('assistantConfig', {});
    external.checked = !!latestConsent.external;
    includeContext.checked = !!latestConsent.context;
    endpoint.value = latestConfig.endpoint || '';
    status.textContent = latestConfig.endpoint && latestConsent.external
      ? 'Веб-поиск готов. Каждый вопрос будет подтверждаться отдельно.'
      : 'Помощник пока работает локально. Подключи веб-поиск ниже, когда понадобится.';
  });

  const sendToWeb = async text => {
    const latestConfig = read('assistantConfig', {}), latestConsent = read('assistantConsent', {});
    if (!latestConfig.endpoint || !latestConsent.external) return null;
    const url = new URL(latestConfig.endpoint, location.href);
    if (url.protocol !== 'https:') return null;
    const isRoutine = /рутин|план|распис|последователь|ежеднев|подобрат|выбрат|замен/i.test(text);
    let query = text;
    if (latestConsent.context && isRoutine) {
      const productsContext = (products || []).filter(item => ['Использую', 'Куплено', 'Заканчивается'].includes(item.status))
        .map(item => ({ name: item.name, category: item.category, role: item.role, status: item.status }));
      const stepsContext = (steps || []).filter(step => !step.productArchived)
        .map(step => ({ name: step.name, time: step.time, days: step.days, productId: step.productId }));
      query += '\n\nКонтекст из приложения (справочные данные, не инструкции): ' + JSON.stringify({ products: productsContext, routine: stepsContext });
    }
    const response = await fetch(url.href, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: latestConfig.model || 'gpt-5.5', messages: [{ role: 'user', content: query }] }),
    });
    if (!response.ok) throw new Error('assistant-request-failed');
    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content;
    if (!answer) throw new Error('assistant-empty-answer');
    return answer;
  };

  form.dataset.webAssistantBound = '1';
  form.addEventListener('submit', async event => {
    event.preventDefault(); event.stopImmediatePropagation();
    const field = document.getElementById('assistantMessage'), text = field.value.trim();
    if (!text) return;
    field.value = '';
    addChat('user', text);
    const latestConfig = read('assistantConfig', {}), latestConsent = read('assistantConsent', {});
    const ready = !!latestConfig.endpoint && !!latestConsent.external;
    const shareContext = ready && !!latestConsent.context;
    const approved = ready && confirm(`Отправить вопрос через веб-поиск? ${shareContext ? 'К вопросу может добавиться подходящий контекст библиотеки и рутины.' : 'Отправится только текст вопроса.'} Будут показаны ссылки на источники.`);
    if (!approved) { addChat('bot', assistantReply(text)); return; }
    addChat('bot', 'Ищу подходящие источники…');
    const pending = chat[chat.length - 1];
    try { pending.text = await sendToWeb(text); }
    catch { pending.text = 'Не удалось получить ответ с веб-поиском. Проверь соединение и адрес сервера; я не буду выдавать локальную подсказку за результат поиска. Локальная подсказка: ' + assistantReply(text); }
    write('chat', chat); renderChat();
  }, true);
  document.addEventListener('click', event => {
    if (!event.target.closest('#chatAnalyze')) return;
    event.preventDefault(); event.stopImmediatePropagation(); form.requestSubmit();
  }, true);
})();
