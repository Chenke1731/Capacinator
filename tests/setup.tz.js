// 固定时区: date/dateUtils 等测试按本地日历断言, 容器 TZ=UTC 会跨日
process.env.TZ = 'Asia/Shanghai';
