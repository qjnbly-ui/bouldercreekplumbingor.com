const menuButton = document.querySelector('.menu-toggle');
const menu = document.querySelector('#site-nav');

menuButton?.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!isOpen));
  menu?.classList.toggle('open', !isOpen);
});

menu?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    menuButton?.setAttribute('aria-expanded', 'false');
    menu.classList.remove('open');
  });
});

const contactForm = document.querySelector('#contact-form');

if (contactForm) {
  contactForm.querySelector('[name="startedAt"]').value = Date.now();
}

contactForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = contactForm.querySelector('button[type="submit"]');
  const status = contactForm.querySelector('#form-status');
  const payload = Object.fromEntries(new FormData(contactForm).entries());

  submitButton.disabled = true;
  submitButton.textContent = 'Sending…';
  status.textContent = '';
  status.className = 'form-status';

  try {
    const response = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || 'Your message could not be sent. Please call (541) 851-1345.');
    }

    contactForm.reset();
    contactForm.querySelector('[name="startedAt"]').value = Date.now();
    status.textContent = 'Thanks—your message was sent. Boulder Creek Plumbing will follow up soon.';
    status.classList.add('is-success');
  } catch (error) {
    status.textContent = error.message;
    status.classList.add('is-error');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Send Request';
  }
});
