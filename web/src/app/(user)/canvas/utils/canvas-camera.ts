import type { CameraControlOptions } from "../types";

type CameraOption = { value: string; label: string; prompt: string };

export const CAMERA_OPTIONS: CameraOption[] = [
    { value: "arri_alexa_mini_lf", label: "ARRI Alexa Mini LF", prompt: "ARRI Alexa Mini LF large-format color science, soft highlight rolloff, natural skin tones" },
    { value: "sony_venice_2", label: "Sony Venice 2", prompt: "Sony Venice 2 full-frame color science, clean shadow detail, restrained cinematic contrast" },
    { value: "red_v_raptor", label: "RED V-Raptor", prompt: "RED V-Raptor large-format rendering, crisp micro-contrast, vivid but controlled color" },
    { value: "blackmagic_ursa_12k", label: "Blackmagic URSA 12K", prompt: "Blackmagic URSA 12K filmic color, neutral texture, broad dynamic range" },
    { value: "kodak_35mm", label: "Kodak 35mm", prompt: "Kodak 35mm film response, organic grain, warm highlights, gentle color separation" },
];

export const LENS_OPTIONS: CameraOption[] = [
    { value: "arri_signature_prime", label: "ARRI Signature Prime", prompt: "ARRI Signature Prime lens, clean rendering, smooth bokeh, controlled flare" },
    { value: "cooke_s7i", label: "Cooke S7/i", prompt: "Cooke S7/i lens, warm dimensional rendering, soft facial contrast, round bokeh" },
    { value: "zeiss_supreme_prime", label: "Zeiss Supreme Prime", prompt: "Zeiss Supreme Prime lens, neutral color, high clarity, gentle focus falloff" },
    { value: "atlas_anamorphic", label: "Atlas Anamorphic", prompt: "Atlas anamorphic lens, horizontal flare, oval bokeh, cinematic edge character" },
    { value: "vintage_leica_r", label: "Vintage Leica R", prompt: "vintage Leica R lens, subtle highlight glow, rich color, softly resolved edges" },
];

export const FOCAL_LENGTH_OPTIONS = [14, 18, 24, 35, 50, 65, 85, 100, 135, 200] as const;
export const APERTURE_OPTIONS = [1.2, 1.4, 1.8, 2, 2.8, 4, 5.6, 8, 11, 16] as const;

export const DEFAULT_CAMERA_CONTROL: CameraControlOptions = {
    enabled: false,
    camera: CAMERA_OPTIONS[0].value,
    lens: LENS_OPTIONS[0].value,
    focalLength: 50,
    aperture: 2.8,
};

const CAMERA_PROMPT_MARKER = "\n\n[Camera direction]\n";

export function normalizeCameraControl(value?: Partial<CameraControlOptions>): CameraControlOptions {
    return {
        enabled: value?.enabled === true,
        camera: CAMERA_OPTIONS.some((item) => item.value === value?.camera) ? value!.camera! : DEFAULT_CAMERA_CONTROL.camera,
        lens: LENS_OPTIONS.some((item) => item.value === value?.lens) ? value!.lens! : DEFAULT_CAMERA_CONTROL.lens,
        focalLength: FOCAL_LENGTH_OPTIONS.includes(value?.focalLength as (typeof FOCAL_LENGTH_OPTIONS)[number]) ? value!.focalLength! : DEFAULT_CAMERA_CONTROL.focalLength,
        aperture: APERTURE_OPTIONS.includes(value?.aperture as (typeof APERTURE_OPTIONS)[number]) ? value!.aperture! : DEFAULT_CAMERA_CONTROL.aperture,
    };
}

export function cameraControlLabel(value?: Partial<CameraControlOptions>) {
    const control = normalizeCameraControl(value);
    return control.enabled ? `${control.focalLength}mm · f/${control.aperture}` : "镜头关闭";
}

export function cameraControlSummary(value?: Partial<CameraControlOptions>) {
    const control = normalizeCameraControl(value);
    if (!control.enabled) return "未启用镜头控制";
    const camera = CAMERA_OPTIONS.find((item) => item.value === control.camera)!;
    const lens = LENS_OPTIONS.find((item) => item.value === control.lens)!;
    return `${camera.label} · ${lens.label} · ${control.focalLength}mm · f/${control.aperture}`;
}

export function applyCameraPrompt(prompt: string, value?: Partial<CameraControlOptions>) {
    const basePrompt = stripCameraPrompt(prompt);
    const control = normalizeCameraControl(value);
    if (!control.enabled) return basePrompt;
    const camera = CAMERA_OPTIONS.find((item) => item.value === control.camera)!;
    const lens = LENS_OPTIONS.find((item) => item.value === control.lens)!;
    const direction = [
        "Treat these as optical and capture characteristics only; do not add a physical camera, lens, tripod, viewfinder, or photography equipment to the scene.",
        camera.prompt,
        lens.prompt,
        focalLengthPrompt(control.focalLength),
        aperturePrompt(control.aperture),
        "Keep the subject, action, composition intent, product details, and environment unchanged.",
    ].join(" ");
    return `${basePrompt}${CAMERA_PROMPT_MARKER}${direction}`.trim();
}

function stripCameraPrompt(prompt: string) {
    return prompt.split(CAMERA_PROMPT_MARKER)[0].trim();
}

function focalLengthPrompt(focalLength: number) {
    if (focalLength <= 24) return `${focalLength}mm wide-angle perspective with strong spatial depth and environment-forward framing.`;
    if (focalLength <= 50) return `${focalLength}mm natural perspective with balanced depth and restrained distortion.`;
    if (focalLength <= 85) return `${focalLength}mm portrait perspective with mild compression and clear subject separation.`;
    return `${focalLength}mm telephoto perspective with strong compression and isolated framing.`;
}

function aperturePrompt(aperture: number) {
    if (aperture <= 2) return `f/${aperture} with very shallow depth of field and smooth cinematic bokeh.`;
    if (aperture <= 4) return `f/${aperture} with moderate subject separation and gentle focus falloff.`;
    if (aperture <= 8) return `f/${aperture} with balanced depth and readable environmental context.`;
    return `f/${aperture} with wide depth of field and foreground-to-background clarity.`;
}
