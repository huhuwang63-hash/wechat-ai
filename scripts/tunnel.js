// Simple tunnel via localtunnel API — keeps running until stopped
// Usage: node scripts/tunnel.js

const PORT = process.env.PORT || 3000;

(async () => {
  const lt = await import('localtunnel');
  const tunnel = await lt.default({ port: PORT });

  console.log(`\n========================================`);
  console.log(`  隧道已启动`);
  console.log(`  ${tunnel.url} → http://localhost:${PORT}`);
  console.log(`  Webhook: ${tunnel.url}/api/wechat/mp`);
  console.log(`========================================\n`);

  tunnel.on('close', () => {
    console.log('隧道已关闭');
  });

  // Keep alive
  process.on('SIGINT', () => {
    tunnel.close();
    process.exit(0);
  });
})();
