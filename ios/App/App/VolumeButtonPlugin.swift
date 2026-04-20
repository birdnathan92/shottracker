//
//  VolumeButtonPlugin.swift
//  Golf Drive Tracker — native iOS plugin that detects hardware Volume Up /
//  Volume Down presses and forwards them to the Capacitor web view.
//
//  Technique (standard camera-app workaround):
//    1. Activate an AVAudioSession (.ambient) so outputVolume updates are visible to us.
//    2. KVO-observe AVAudioSession.sharedInstance().outputVolume.
//    3. When the user presses a volume button, outputVolume changes — we emit a
//       "volumeUp" / "volumeDown" event to JS, then reset the slider inside a hidden
//       MPVolumeView so the iOS volume HUD doesn't appear repeatedly and the user
//       always has headroom on both sides of the range.
//

import Foundation
import Capacitor
import AVFoundation
import MediaPlayer
import UIKit

@objc(VolumeButtonPlugin)
public class VolumeButtonPlugin: CAPPlugin {
    private var audioSession: AVAudioSession?
    private var volumeObserver: NSKeyValueObservation?
    private var hiddenVolumeView: MPVolumeView?
    private var hiddenSlider: UISlider?
    private var ignoreNextChange = false
    private var isListening = false

    // We pin the hardware volume to this mid-range value so the user always has
    // headroom in both directions. Set back to user's original on stop().
    private let restingVolume: Float = 0.5
    private var originalVolume: Float = 0.5

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.beginListening()
            call.resolve(["listening": self.isListening])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.endListening()
            call.resolve()
        }
    }

    private func beginListening() {
        guard !isListening else {
            NSLog("[VolumeButtonPlugin] beginListening: already listening, skipping")
            return
        }
        NSLog("[VolumeButtonPlugin] beginListening: activating audio session")

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.ambient, options: [.mixWithOthers])
            try session.setActive(true)
            NSLog("[VolumeButtonPlugin] AVAudioSession active, outputVolume=\(session.outputVolume)")
        } catch {
            NSLog("[VolumeButtonPlugin] Failed to activate AVAudioSession: \(error)")
            return
        }
        audioSession = session
        originalVolume = session.outputVolume

        // Inject a hidden MPVolumeView so we can programmatically set the volume
        // (which suppresses the iOS volume HUD flash on each press).
        // Use an iOS-14-safe window lookup: UIWindowScene.keyWindow is iOS 15+,
        // so walk the scene's windows and pick the key one manually.
        let foundWindow: UIWindow? = {
            for scene in UIApplication.shared.connectedScenes {
                guard let ws = scene as? UIWindowScene else { continue }
                if let key = ws.windows.first(where: { $0.isKeyWindow }) {
                    return key
                }
                if let first = ws.windows.first {
                    return first
                }
            }
            return UIApplication.shared.windows.first
        }()
        if let window = foundWindow {
            let vv = MPVolumeView(frame: CGRect(x: -2000, y: -2000, width: 1, height: 1))
            vv.alpha = 0.001
            vv.isUserInteractionEnabled = false
            // (showsRouteButton was deprecated in iOS 13; the route button is
            //  harmless off-screen anyway, so we simply don't touch it.)
            window.addSubview(vv)
            self.hiddenVolumeView = vv
            // MPVolumeView builds its slider asynchronously; wait a tick.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
                guard let self = self else { return }
                for sub in vv.subviews {
                    if let slider = sub as? UISlider {
                        self.hiddenSlider = slider
                        break
                    }
                }
                // Seed volume in the middle so Volume Up is always detectable.
                self.setSystemVolume(self.restingVolume)
            }
        }

        volumeObserver = session.observe(\.outputVolume, options: [.new, .old]) { [weak self] _, change in
            guard let self = self else { return }
            guard let newV = change.newValue, let oldV = change.oldValue else { return }

            // Ignore the programmatic reset we issue ourselves.
            if self.ignoreNextChange {
                self.ignoreNextChange = false
                NSLog("[VolumeButtonPlugin] KVO: ignoring programmatic reset (\(oldV) → \(newV))")
                return
            }

            let direction: String
            if newV > oldV + 0.0001 {
                direction = "volumeUp"
            } else if newV < oldV - 0.0001 {
                direction = "volumeDown"
            } else {
                return
            }

            NSLog("[VolumeButtonPlugin] emit \(direction) (\(oldV) → \(newV))")
            self.notifyListeners(direction, data: [:])

            // Reset volume back to the middle so the next press registers too.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
                guard let self = self else { return }
                self.setSystemVolume(self.restingVolume)
            }
        }

        isListening = true
    }

    private func endListening() {
        volumeObserver?.invalidate()
        volumeObserver = nil

        // Restore user's original volume before we tear down.
        setSystemVolume(originalVolume)

        hiddenVolumeView?.removeFromSuperview()
        hiddenVolumeView = nil
        hiddenSlider = nil

        try? audioSession?.setActive(false, options: [.notifyOthersOnDeactivation])
        audioSession = nil
        isListening = false
    }

    private func setSystemVolume(_ value: Float) {
        guard let slider = hiddenSlider else { return }
        ignoreNextChange = true
        slider.value = value
        // Safety: if the KVO never fires for some reason, clear the ignore flag later.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            self?.ignoreNextChange = false
        }
    }

    deinit {
        volumeObserver?.invalidate()
    }
}
