// ==UserScript==
// @name         FB-Chat-Monitor
// @namespace    https://github.com/JuanHopla/FB-Chat-Monitor
// @version      1.2.1
// @description  Monitor and auto-respond to Facebook Marketplace messages with AI assistance
// @author       JuanHopla
// @match        https://www.messenger.com/*
// @match        https://www.facebook.com/marketplace/inbox*
// @match        https://www.facebook.com/messages*
// @match        https://www.facebook.com/marketplace/item/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_deleteValue
// @grant        GM_listValues
// @connect      api.openai.com
// @connect      facebook.com
// @connect      messenger.com
// @connect      fbcdn.net
// @connect      *.fbcdn.net
// @connect      fbsbx.com
// @connect      *.fbsbx.com
// @connect      cdn.fbsbx.com
// @connect      video-*.xx.fbcdn.net
// @connect      scontent-*.xx.fbcdn.net
// @updateURL    https://juanhopla.github.io/FB-Chat-Monitor/main.user.js
// @downloadURL  https://juanhopla.github.io/FB-Chat-Monitor/main.user.js
// @license      MIT
// @run-at       document-idle
// ==/UserScript==