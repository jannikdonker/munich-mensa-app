//! WebKitGTK handles a touchpad pinch by magnifying the whole page (a GtkGestureZoom on
//! the web view), and the page never sees the gesture. We take the pinch events before
//! that gesture does and forward them to the frontend, which zooms only the map.

use gtk::{
    gdk::{self, ffi},
    glib::{self, translate::ToGlibPtr},
    prelude::*,
};
use serde::Serialize;
use tauri::{Emitter, WebviewWindow};

#[derive(Clone, Serialize)]
struct TouchpadPinch {
    phase: &'static str,
    /// Gesture centre in CSS pixels relative to the web view.
    x: f64,
    y: f64,
    /// Scale relative to the start of the gesture.
    scale: f64,
}

pub fn forward_touchpad_pinch(window: &WebviewWindow) -> tauri::Result<()> {
    let emitter = window.clone();
    window.with_webview(move |webview| {
        // GTK3 runs the widget's `event` signal before bubble-phase gestures such as
        // WebKit's zoom gesture, so stopping the event here keeps the page unmagnified.
        webview.inner().connect_event(move |_, event| {
            let Some(pinch) = event.downcast_ref::<gdk::EventTouchpadPinch>() else {
                return glib::Propagation::Proceed;
            };
            // gdk-rs only exposes the phase as a bool, so read the raw C enum.
            let raw: *const ffi::GdkEventTouchpadPinch = pinch.to_glib_none().0;
            let phase = match i32::from(unsafe { (*raw).phase }) {
                ffi::GDK_TOUCHPAD_GESTURE_PHASE_BEGIN => "begin",
                ffi::GDK_TOUCHPAD_GESTURE_PHASE_UPDATE => "update",
                _ => "end",
            };
            let (x, y) = pinch.position();
            let payload = TouchpadPinch {
                phase,
                x,
                y,
                scale: pinch.scale(),
            };
            if let Err(e) = emitter.emit("touchpad-pinch", payload) {
                log::warn!("could not forward pinch: {e}");
            }
            glib::Propagation::Stop
        });
    })
}
