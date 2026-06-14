// Robust tunnel with auto-reconnect using localtunnel
// Usage: node scripts/tunnel.mjs

const PORT = process.env.PORT || 3000;

async function startTunnel() {
  const lt = await import('localtunnel');

  return new Promise((resolve, reject) => {
    const tunnel = lt.default({ port: PORT }, (err, tunnel) => {
      if (err) return reject(err);

      console.log(`\n隧道已启动: ${tunnel.url} → http://localhost:${PORT}`);
      console.log(`Webhook: ${tunnel.url}/api/wechat/mp\n`);
      resolve(tunnel);
    });

    tunnel.on('close', () => {
      console.log('隧道断开，5秒后重连...');
      setTimeout(startTunnel, 5000);
    });

    tunnel.on('error', (err) => {
      console.error('隧道错误:', err.message);
    });
  });
}

startTunnel().catch((err) => {
  console.error('启动失败:', err.message);
  console.log('5秒后重试...');
  setTimeout(startTunnel, 5000);
});

// Keep process alive
setInterval(() => {}, 60000);
