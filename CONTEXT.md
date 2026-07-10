# CloudBot

A Twitch chatbot and stream overlay with interactive visual effects, session management, show notes, and community engagement features.

## Language

**Cloud** (floating): The animated cloud images (`cloud-*.png`) that scroll across the top of the overlay screen. Each has its own random base speed set at creation.
_Avoid_: Cloud GIF, reaction image

**Cloud reaction**: The `cloud()` function that displays a CB-*.gif reaction image in the overlay viewer for 5 seconds.
_Avoid_: Floating cloud, moving cloud

**Cloud speed**: The CSS `animation-duration` of a floating cloud. Composed of a per-cloud random base duration and a global speed multiplier.

**Base speed**: Each floating cloud's individual random animation duration (50–200s), assigned once at creation and stored in `dataset.baseDuration`.

**Speed multiplier**: A factor applied to all floating clouds' base speeds in response to chat activity or Twitch events. Multipliers replace the old fixed per-condition durations so clouds retain their individual differences while collectively speeding up or slowing down.

**Message velocity**: Chat messages per minute (MPM) tracked over a rolling 60-second window. Used by `applyDynamicWeather` to modulate cloud speed and sky appearance.

**Dynamic weather**: Automatic weather system that changes the sky color and optionally triggers rain based on message velocity tiers.

**Weather override**: A forced weather state (thunderstorm or rainbow sunshine) triggered by Twitch events (raid, sub, cheer) that temporarily supersedes dynamic weather tracking. Decays after a timeout and returns to message-velocity-based weather.

**Speed factors**: Canonical multiplier values. Normal = 1.0, light activity (10–25 MPM) = 0.5, high activity (≥25 MPM) = 0.12, thunderstorm (raid) = 0.08, sunshine (sub/cheer) = 1.8.
