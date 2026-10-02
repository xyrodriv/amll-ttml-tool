/*
 * 节拍器。
 *
 * 用 Web Audio 的预调度（"A Tale of Two Clocks" 模式）：setInterval 只负责把
 * 未来一小段时间内的音符铺进 AudioContext 的时间轴，真正的发声时刻由音频时钟
 * 决定。主线程偶尔卡顿也不会让节拍抖动，这是用 setTimeout 直接发声做不到的。
 */
import { audioEngine } from "./audio-engine";

const SCHEDULER_INTERVAL_MS = 25;
const SCHEDULE_AHEAD_S = 0.12;
/** 落后超过这个秒数就不再补拍，直接重新对齐时间轴。 */
const MAX_CATCHUP_S = 0.5;
const BEATS_PER_BAR = 4;

/** 小节重音比普通拍高一点，方便听出第一拍。 */
const ACCENT_HZ = 1500;
const NORMAL_HZ = 1000;

class Metronome {
	private timer: ReturnType<typeof setInterval> | null = null;
	/** 已经排进音频时间轴、还没响的音符。暂停时要显式取消，见 stop()。 */
	private scheduled: Array<{ osc: OscillatorNode; gain: GainNode }> = [];
	private nextNoteTime = 0;
	private beat = 0;
	private bpm = 120;
	private volume = 0.6;
	private running = false;

	private click(time: number, accent: boolean) {
		const ctx = audioEngine.ctx;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();

		osc.type = "sine";
		osc.frequency.setValueAtTime(accent ? ACCENT_HZ : NORMAL_HZ, time);

		// 用线性衰减而不是指数衰减：指数斜坡的起点不能为 0，音量为 0 时会出问题。
		gain.gain.setValueAtTime(0, time);
		gain.gain.linearRampToValueAtTime(this.volume, time + 0.002);
		gain.gain.linearRampToValueAtTime(0, time + 0.05);

		osc.connect(gain);
		// 直连 destination，绕开音乐的主 gain，这样节拍器音量独立于音乐音量。
		gain.connect(ctx.destination);

		const entry = { osc, gain };
		this.scheduled.push(entry);
		osc.onended = () => {
			const index = this.scheduled.indexOf(entry);
			if (index >= 0) this.scheduled.splice(index, 1);
			gain.disconnect();
		};

		osc.start(time);
		osc.stop(time + 0.06);
	}

	private advance() {
		this.nextNoteTime += 60 / Math.max(1, this.bpm);
		this.beat = (this.beat + 1) % BEATS_PER_BAR;
	}

	private scheduler = () => {
		const ctx = audioEngine.ctx;
		// 标签页被切走时浏览器会节流 setInterval，而音频时钟照常走。回来之后
		// nextNoteTime 可能落后一大截，下面的循环会把所有错过的拍一次性倒出来
		// —— 几百个振荡器同时响。落后太多就直接把时间轴拉到当前时刻。
		if (this.nextNoteTime < ctx.currentTime - MAX_CATCHUP_S) {
			this.nextNoteTime = ctx.currentTime + 0.03;
			this.beat = 0;
		}
		while (this.nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
			this.click(this.nextNoteTime, this.beat === 0);
			this.advance();
		}
	};

	setBpm(bpm: number) {
		this.bpm = bpm > 0 ? bpm : 120;
	}

	setVolume(volume: number) {
		this.volume = Math.max(0, Math.min(1, volume));
	}

	start() {
		if (this.running) return;
		this.running = true;

		const ctx = audioEngine.ctx;
		// AudioContext 在没有用户手势之前是 suspended，不 resume 就完全没有声音。
		void ctx.resume();

		this.beat = 0;
		this.nextNoteTime = ctx.currentTime + 0.06;
		this.timer = setInterval(this.scheduler, SCHEDULER_INTERVAL_MS);
		// 先铺一次，省得等到第一个 interval 才响。
		this.scheduler();
	}

	stop() {
		this.running = false;
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
		// clearInterval 只停掉调度器；已经排进 AudioContext 时间轴的音符照常会响。
		// 不取消的话暂停之后还会漏出一声。stop() 的时刻早于 start 时刻 = 永远不发声。
		for (const { osc, gain } of this.scheduled) {
			try {
				osc.stop();
			} catch {
				// 已经结束的节点再 stop 会抛，忽略即可
			}
			gain.disconnect();
		}
		this.scheduled = [];
	}

	get isRunning() {
		return this.running;
	}
}

export const metronome = new Metronome();
export default metronome;
