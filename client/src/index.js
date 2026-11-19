document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('addUserForm');
  const userList = document.getElementById('userList');
  const submitButton = document.getElementById('submitButton');
  const submitLabel = document.getElementById('submitLabel');
  const formMessage = document.getElementById('formMessage');
  const flowPayload = document.getElementById('flowPayload');
  const sqlParameters = document.getElementById('sqlParameters');

  fetchUsers().catch((error) => {
    console.error('Unable to load users:', error);
    showFormMessage('Could not load records: ' + error.message, 'error');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const user = {
      name: document.getElementById('name').value.trim(),
      email: document.getElementById('email').value.trim(),
      role: document.getElementById('role').value,
    };

    if (!user.name || !user.email) {
      showFormMessage('Enter a name and email address before sending.', 'error');
      return;
    }

    const startedAt = performance.now();
    flowPayload.textContent = JSON.stringify(user, null, 2);
    sqlParameters.textContent = JSON.stringify([user.name, user.email, user.role]);
    setFlowState('browser', 'success', 'READY');
    setFlowState('api', 'active', 'IN FLIGHT');
    setFlowState('database', 'idle', 'WAITING');
    setFlowState('response', 'idle', 'WAITING');
    setFlowMessage('Sending JSON to POST /api/users…', 'active');
    showFormMessage('Request sent. Waiting for the API and database…');
    submitButton.disabled = true;
    submitLabel.textContent = 'Saving…';

    try {
      const { response, data } = await requestJson('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      });

      const elapsed = Math.round(performance.now() - startedAt);
      setFlowState('api', 'success', '201 RECEIVED');
      setFlowState('database', 'success', 'INSERT OK');
      setFlowState('response', 'success', 'DELIVERED');
      setFlowMessage(
        'MySQL insert confirmed · users.id = ' + data.id + ' · HTTP ' + response.status + ' · ' + elapsed + ' ms',
        'success'
      );
      showFormMessage('User saved successfully. Record ID: ' + data.id, 'success');
      form.reset();

      try {
        await fetchUsers();
      } catch (error) {
        showFormMessage('Record was saved, but the list could not refresh: ' + error.message, 'error');
      }
    } catch (error) {
      const status = error.status;
      if (status) {
        setFlowState('api', 'success', 'RESPONSE ' + status);
        setFlowState('response', 'error', 'FAILED');
        if (status >= 500) {
          setFlowState('database', 'error', 'INSERT FAILED');
        }
      } else {
        setFlowState('api', 'error', 'NO RESPONSE');
        setFlowState('response', 'error', 'FAILED');
        setConnectionStatus('offline', 'API unavailable');
      }

      const elapsed = Math.round(performance.now() - startedAt);
      setFlowMessage('Request failed' + (status ? ' · HTTP ' + status : '') + ' · ' + elapsed + ' ms · ' + error.message, 'error');
      showFormMessage('Could not save the user: ' + error.message, 'error');
      console.error('Unable to save user:', error);
    } finally {
      submitButton.disabled = false;
      submitLabel.textContent = 'Send record';
    }
  });

  userList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const row = button.closest('[data-user-id]');
    const userId = row.dataset.userId;

    if (button.dataset.action === 'edit') {
      const name = prompt('Enter the new name:', row.dataset.name);
      if (name === null) return;
      const email = prompt('Enter the new email:', row.dataset.email);
      if (email === null) return;
      const role = prompt('Enter the new role (User/Admin):', row.dataset.role);
      if (role === null) return;

      if (!name.trim() || !email.trim() || !['User', 'Admin'].includes(role.trim())) {
        showFormMessage('Enter a name, valid email, and role of User or Admin.', 'error');
        return;
      }

      try {
        await requestJson('/api/users/' + encodeURIComponent(userId), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), email: email.trim(), role: role.trim() }),
        });
        showFormMessage('User updated successfully.', 'success');
        await fetchUsers();
      } catch (error) {
        showFormMessage('Could not update the user: ' + error.message, 'error');
      }
    }

    if (button.dataset.action === 'delete' && confirm('Delete this user?')) {
      try {
        await requestJson('/api/users/' + encodeURIComponent(userId), { method: 'DELETE' });
        showFormMessage('User deleted successfully.', 'success');
        await fetchUsers();
      } catch (error) {
        showFormMessage('Could not delete the user: ' + error.message, 'error');
      }
    }
  });
});

async function requestJson(url, options) {
  const response = await fetch(url, options);
  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error('The server returned an invalid JSON response.');
  }

  if (!response.ok) {
    const requestError = new Error(data.error || response.statusText || 'Request failed.');
    requestError.status = response.status;
    throw requestError;
  }

  return { response, data };
}

async function fetchUsers() {
  try {
    const { data: users } = await requestJson('/api/users');
    renderUsers(users);
    document.getElementById('userCount').textContent = users.length;
    document.getElementById('recordCount').textContent =
      users.length + (users.length === 1 ? ' record' : ' records');
    setConnectionStatus('online', 'API + database connected');
  } catch (error) {
    document.getElementById('recordCount').textContent = 'Records unavailable';
    setConnectionStatus('offline', 'API unavailable');
    throw error;
  }
}

function renderUsers(users) {
  const userList = document.getElementById('userList');
  userList.replaceChildren();

  if (!users.length) {
    const emptyState = document.createElement('li');
    emptyState.className = 'empty-state';
    emptyState.textContent = 'No users yet. Add one above to create the first database record.';
    userList.appendChild(emptyState);
    return;
  }

  users.forEach((user) => {
    const row = document.createElement('li');
    row.className = 'user-row';
    row.dataset.userId = user.id;
    row.dataset.name = user.name;
    row.dataset.email = user.email;
    row.dataset.role = user.role;

    const details = document.createElement('div');
    details.className = 'user-details';

    const avatar = document.createElement('span');
    avatar.className = 'user-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = String(user.name || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase() || '?';

    const text = document.createElement('div');
    text.className = 'user-text';

    const name = document.createElement('span');
    name.className = 'user-name';
    name.textContent = user.name;

    const email = document.createElement('span');
    email.className = 'user-email';
    email.textContent = user.email;

    text.append(name, email);
    details.append(avatar, text);

    const actions = document.createElement('div');
    actions.className = 'user-actions';

    const role = document.createElement('span');
    role.className = 'role-badge' + (user.role === 'Admin' ? ' admin' : '');
    role.textContent = user.role;

    const editButton = createActionButton('edit', 'Edit');
    const deleteButton = createActionButton('delete', 'Delete');
    actions.append(role, editButton, deleteButton);
    row.append(details, actions);
    userList.appendChild(row);
  });
}

function createActionButton(action, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'action-button ' + action;
  button.dataset.action = action;
  button.textContent = label;
  return button;
}

function setFlowState(step, state, label) {
  const element = document.querySelector('[data-flow-step="' + step + '"]');
  element.dataset.state = state;
  element.querySelector('.step-state').textContent = label;
}

function setFlowMessage(message, state) {
  const element = document.getElementById('flowMessage');
  element.textContent = message;
  element.dataset.state = state || 'idle';
}

function showFormMessage(message, state) {
  const element = document.getElementById('formMessage');
  element.textContent = message;
  element.dataset.state = state || 'idle';
}

function setConnectionStatus(state, message) {
  const status = document.getElementById('connectionStatus');
  status.dataset.state = state;
  document.getElementById('connectionLabel').textContent = message;
}
