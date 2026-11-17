'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, X, Loader2, Bot, User, Cpu, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { ChatMessage } from '@/types';

interface AIChatDrawerProps {
  projectId?: string;
  projectName?: string;
  onClose: () => void;
}

function renderMarkdown(text: string) {
  // Simple inline markdown renderer
  return text
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*<\/li>)/, '<ul>$1</ul>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/\n\n/g, '</p><p>')
    .trim();
}

const QUICK_PROMPTS = [
  'Summarize this project\'s health status',
  'Generate a list of tasks for user authentication feature',
  'What\'s the best sprint planning approach for our team size?',
  'Help me write acceptance criteria for the login feature',
];

export default function AIChatDrawer({ projectId, projectName, onClose }: AIChatDrawerProps) {
  const [messages, setMessages]   = useState<ChatMessage[]>([
    {
      role: 'model',
      content: `👋 Hi! I'm **FlowPilot AI**, your engineering & project management assistant.${projectName ? `\n\nI have context about **${projectName}** — ask me anything about the project, tasks, sprint planning, or technical decisions.` : '\n\nAsk me anything about your project — task breakdowns, sprint planning, bug analysis, or architecture advice.'}`,
    },
  ]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const bottomRef               = useRef<HTMLDivElement>(null);
  const inputRef                = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = async (text?: string) => {
    const userText = (text || input).trim();
    if (!userText || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: userText };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const { data } = await api.post<{
        success: boolean;
        message?: string;
        data?: { reply: string };
      }>('/ai/chat', {
        messages: updatedMessages,
        projectId,
      });

      const reply = data.data?.reply;
      if (!data.success || typeof reply !== 'string') {
        throw new Error(data.message || 'The assistant returned an empty response.');
      }
      setMessages((prev) => [...prev, { role: 'model', content: reply }]);
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
      setMessages((prev) => [...prev, {
        role: 'model',
        content: typeof message === 'string'
          ? `⚠️ ${message}`
          : error instanceof Error
            ? `⚠️ ${error.message}`
            : '⚠️ I could not get a response. Please try again.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearChat = () => setMessages([{
    role: 'model',
    content: '✨ Chat cleared. How can I help you?',
  }]);

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[420px] bg-slate-900 border-l border-slate-800 flex flex-col z-40 shadow-2xl animate-slide-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center">
            <Cpu className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">FlowPilot AI</p>
            <p className="text-[10px] text-slate-500">{projectName ? `Context: ${projectName}` : 'General Assistant'}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={clearChat} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition" title="Clear chat">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} aria-label="Close AI chat" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 ${
              msg.role === 'user' ? 'bg-indigo-600' : 'bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-700'
            }`}>
              {msg.role === 'user'
                ? <User className="w-3.5 h-3.5 text-white" />
                : <Bot className="w-3.5 h-3.5 text-indigo-400" />
              }
            </div>

            {/* Bubble */}
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
              msg.role === 'user'
                ? 'bg-indigo-600 text-white rounded-tr-sm'
                : 'bg-slate-800 text-slate-300 rounded-tl-sm border border-slate-700'
            }`}>
              {msg.role === 'model' ? (
                <div
                  className="prose-dark"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                />
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-700 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts (only when no user messages) */}
      {messages.length === 1 && (
        <div className="px-4 pb-3 grid grid-cols-1 gap-1.5">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => sendMessage(p)}
              className="text-left text-xs text-slate-400 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 rounded-lg px-3 py-2 transition"
            >
              <Sparkles className="w-3 h-3 text-indigo-500 inline mr-1.5" />
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-slate-800">
        <div className="flex gap-2 bg-slate-800 border border-slate-700 rounded-xl p-2 focus-within:border-indigo-500/60 transition">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your project, tasks, sprint planning…"
            rows={2}
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-600 resize-none focus:outline-none leading-relaxed"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="self-end w-8 h-8 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg flex items-center justify-center transition flex-shrink-0"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="text-[10px] text-slate-700 mt-1.5 text-center">
          Shift+Enter for new line · Enter to send
        </p>
      </div>
    </div>
  );
}
