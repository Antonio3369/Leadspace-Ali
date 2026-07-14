#!/usr/bin/env bash
# 在服务器执行：DNS 生效后申请 SSL 并启用 Nginx
set -euo pipefail

DOMAIN="ali.orblead.com"
APP_DIR="/opt/leadspace-alipay"

if ! dig +short "${DOMAIN}" A | grep -q .; then
  echo "DNS 尚未生效：请先在腾讯云为 ${DOMAIN} 添加 A 记录 -> 43.136.25.181"
  exit 1
fi

echo "==> 申请 Let's Encrypt 证书..."
sudo certbot certonly --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m admin@orblead.com || \
sudo certbot certonly --webroot -w /var/www/html -d "${DOMAIN}" --non-interactive --agree-tos -m admin@orblead.com

echo "==> 安装 Nginx 配置（conf.d）..."
sudo cp "${APP_DIR}/deploy/nginx/ali.orblead.com.conf" /etc/nginx/conf.d/ali-orblead.conf
sudo nginx -t
sudo systemctl reload nginx

echo "==> HTTPS 已启用：https://${DOMAIN}"
