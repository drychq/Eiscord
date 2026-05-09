import { check, sleep } from 'k6';
import http from 'k6/http';
import ws from 'k6/ws';
import { Counter, Trend } from 'k6/metrics';

const apiBaseUrl = __ENV.API_BASE_URL || 'http://localhost:3000/api/v1';
const realtimeUrl = __ENV.REALTIME_WS_URL || 'ws://localhost:3000/socket.io/?EIO=4&transport=websocket';
const senderUsername = __ENV.SENDER_USERNAME || 'alice';
const receiverUsername = __ENV.RECEIVER_USERNAME || 'bob';
const password = __ENV.DEMO_PASSWORD || 'DemoPass1';
const channelId = __ENV.CHANNEL_ID || '10000000-0000-4000-8000-000000000501';
const voiceChannelId = __ENV.VOICE_CHANNEL_ID || '10000000-0000-4000-8000-000000000503';

export const message_visible_ms = new Trend('message_visible_ms', true);
export const voice_state_ms = new Trend('voice_state_ms', true);
export const realtime_errors = new Counter('realtime_errors');

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      duration: __ENV.K6_DURATION || '30s',
      vus: Number(__ENV.K6_VUS || 5),
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1000'],
    message_visible_ms: ['p(95)<1000'],
    voice_state_ms: ['p(95)<3000'],
    realtime_errors: ['count<10'],
  },
};

export function setup() {
  return {
    receiverToken: login(receiverUsername),
    senderToken: login(senderUsername),
  };
}

export default function (tokens) {
  const content = `k6 message ${__VU}-${__ITER}-${Date.now()}`;
  let sentAt = 0;

  const res = ws.connect(
    realtimeUrl,
    { tags: { flow: 'm6_realtime' }, timeout: '5s' },
    (socket) => {
      socket.on('open', () => {
        socket.send(`40/realtime,{"token":"${tokens.receiverToken}"}`);
      });

      socket.on('message', (rawMessage) => {
        if (rawMessage === '2') {
          socket.send('3');
          return;
        }

        if (typeof rawMessage !== 'string') {
          return;
        }

        if (rawMessage.startsWith('40/realtime')) {
          socket.send(
            `42/realtime,["Subscribe",{"scope_type":"channel","scope_id":"${channelId}"}]`,
          );
          sentAt = Date.now();
          sendChannelMessage(tokens.senderToken, content);
          return;
        }

        if (rawMessage.includes('MessageCreated') && rawMessage.includes(content)) {
          message_visible_ms.add(Date.now() - sentAt);
          socket.close();
        }
      });

      socket.on('error', () => {
        realtime_errors.add(1);
      });

      socket.setTimeout(() => {
        realtime_errors.add(1);
        socket.close();
      }, 5000);
    },
  );

  check(res, {
    'socket connected': (response) => response && response.status === 101,
  });
  checkVoiceState(tokens.senderToken);
  sleep(1);
}

function login(username) {
  const response = http.post(
    `${apiBaseUrl}/auth/login`,
    JSON.stringify({
      login_identifier: username,
      password,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(response, {
    [`${username} login ok`]: (res) => res.status === 201 && !!res.json('data.access_token'),
  });

  return response.json('data.access_token');
}

function sendChannelMessage(token, content) {
  const response = http.post(
    `${apiBaseUrl}/channels/${channelId}/messages`,
    JSON.stringify({ content }),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
  );

  check(response, {
    'message send ok': (res) => res.status === 201,
  });
}

function checkVoiceState(token) {
  const startedAt = Date.now();
  const joinResponse = http.post(
    `${apiBaseUrl}/voice/channels/${voiceChannelId}/join`,
    JSON.stringify({
      initial_deafen_state: false,
      initial_mute_state: false,
    }),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
  );
  const sessionId = joinResponse.json('data.session_id');

  if (!sessionId) {
    realtime_errors.add(1);
    return;
  }

  const stateResponse = http.patch(
    `${apiBaseUrl}/voice/sessions/${sessionId}/state`,
    JSON.stringify({ mute_state: true }),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
  );

  check(stateResponse, {
    'voice state update ok': (res) => res.status === 200,
  });
  voice_state_ms.add(Date.now() - startedAt);
}
