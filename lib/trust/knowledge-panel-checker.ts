export interface KnowledgePanelResult {
  present: boolean;
  accurate: boolean | null;
  url: string | null;
}

export async function checkKnowledgePanel(
  brandName: string,
  brandDomain: string,
): Promise<KnowledgePanelResult> {
  if (process.env.LLM_MODE === "mock") {
    return { present: false, accurate: null, url: null };
  }

  try {
    const query = encodeURIComponent(`${brandName} ${brandDomain}`);
    const res = await fetch(
      `https://www.google.com/search?q=${query}&gl=au`,
      {
        headers: {
          "User-Agent": "VisibleAU-KPChecker/1.0",
        },
      },
    );

    if (!res.ok) return { present: false, accurate: null, url: null };

    const html = await res.text();
    const hasKP = html.includes("kp-wholepage") || html.includes("knowledge-panel");

    return {
      present: hasKP,
      accurate: hasKP ? null : null,
      url: hasKP ? `https://www.google.com/search?q=${query}&gl=au&kgmid=` : null,
    };
  } catch {
    return { present: false, accurate: null, url: null };
  }
}
