"use client";

import { useRef, useState } from "react";
import { AudioLines, Image as ImageIcon, Lightbulb, Paperclip, Send, Video } from "lucide-react";

import { HOME_CREATION_MODES, type HomeCreationMode } from "./home-data";
import { useHomeActions } from "./home-actions";
import styles from "./home-agent-hero.module.css";

const modeIcons = {
    agent: Lightbulb,
    image: ImageIcon,
    video: Video,
    audio: AudioLines,
} as const;

export function HomeAgentHero() {
    const [prompt, setPrompt] = useState("");
    const [mode, setMode] = useState<HomeCreationMode>("agent");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { startCreating } = useHomeActions();
    const currentMode = HOME_CREATION_MODES.find((item) => item.id === mode) ?? HOME_CREATION_MODES[0];

    const submit = () => {
        if (!prompt.trim()) {
            textareaRef.current?.focus();
            return;
        }
        startCreating(prompt, mode);
    };

    return (
        <section className={styles.hero} aria-labelledby="home-hero-title">
            <span className={`${styles.floatingArtifact} ${styles.artifactAgent}`} data-hero-decoration aria-hidden="true">
                <span className={styles.artifactFace}>
                    <Lightbulb />
                </span>
            </span>
            <span className={`${styles.floatingArtifact} ${styles.artifactImage}`} data-hero-decoration aria-hidden="true">
                <span className={styles.artifactFace}>
                    <ImageIcon />
                </span>
            </span>
            <span className={`${styles.floatingArtifact} ${styles.artifactVideo}`} data-hero-decoration aria-hidden="true">
                <span className={styles.artifactFace}>
                    <Video />
                </span>
            </span>
            <span className={`${styles.floatingArtifact} ${styles.artifactAudio}`} data-hero-decoration aria-hidden="true">
                <span className={styles.artifactFace}>
                    <AudioLines />
                </span>
            </span>
            <div className={styles.heroContent}>
                <h1 id="home-hero-title" className={styles.heroTitle}>
                    一个入口 完成所有 <span>AI 创作</span>
                </h1>
                <p className={styles.heroSubtitle}>从图片、视频、音频到 Agent 编排，让每个想法直接进入完整创作流程</p>

                <div className={styles.agentStage}>
                    <div className={styles.agentRing} data-testid="home-agent-halo" aria-hidden="true">
                        <span className={styles.ringGround} data-halo-ring />
                        <span className={styles.ringOuter} data-halo-ring />
                        <span className={styles.ringMiddle} data-halo-ring />
                        <span className={styles.ringInner} data-halo-ring />
                    </div>
                    <div className={styles.agentCard} data-testid="home-agent-card">
                        <div className={styles.inputArea}>
                            <label htmlFor="home-agent-prompt" className={styles.srOnly}>
                                描述你想创作的内容
                            </label>
                            <textarea
                                ref={textareaRef}
                                id="home-agent-prompt"
                                value={prompt}
                                onChange={(event) => setPrompt(event.target.value)}
                                onKeyDown={(event) => {
                                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit();
                                }}
                                className={styles.agentTextarea}
                                placeholder="描述你想创作的内容，比如："
                                rows={3}
                            />
                        </div>

                        <div className={styles.promptExamples} aria-label="示例提示词">
                            {currentMode.examples.map((example) => (
                                <button key={example} type="button" onClick={() => setPrompt(example)}>
                                    {example}
                                </button>
                            ))}
                        </div>

                        <div className={styles.agentToolbar}>
                            <div className={styles.creationModes} role="group" aria-label="创作模式">
                                {HOME_CREATION_MODES.map((item) => {
                                    const Icon = modeIcons[item.icon];
                                    return (
                                        <button key={item.id} type="button" className={mode === item.id ? styles.modeActive : undefined} onClick={() => setMode(item.id)} aria-label={item.label} title={item.label} aria-pressed={mode === item.id}>
                                            <span className={styles.modeIcon}>
                                                <Icon aria-hidden="true" />
                                            </span>
                                            <span className={styles.modeLabel}>{item.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className={styles.agentTools}>
                                <button type="button" aria-label="进入创作页添加参考素材" title="进入创作页添加参考素材" onClick={() => startCreating(prompt, mode)}>
                                    <Paperclip aria-hidden="true" />
                                </button>
                                <button type="button" className={styles.sendButton} aria-label="开始创作" title="开始创作" onClick={submit}>
                                    <Send aria-hidden="true" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
