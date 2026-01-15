import { handleCancel } from './request';

/**
 * Send acknowledgment for a request
 */
function sendAck(broadcast: BroadcastChannel, requestId: string) {
  broadcast.postMessage({
    type: 'ack',
    requestId,
  });
}

/**
 * Handle 'cancel' request: cancel a pending request
 */
const handleCancelRequest = (broadcast: BroadcastChannel, url: URL, requestId: string) => {
  sendAck(broadcast, requestId);
  handleCancel(url);
};

export const installBroadcastChannelListener = () => {
  const broadcast = new BroadcastChannel('immich');
  // eslint-disable-next-line  unicorn/prefer-add-event-listener
  broadcast.onmessage = (event) => {
    if (!event.data?.requestId) {
      return;
    }

    const requestId = event.data.requestId;
    const url = event.data.url ? new URL(event.data.url, self.location.origin) : undefined;
    if (!url) {
      return;
    }

    switch (event.data.type) {
      case 'cancel': {
        handleCancelRequest(broadcast, url, requestId);
        break;
      }
    }
  };
};
