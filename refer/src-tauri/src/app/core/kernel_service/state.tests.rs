use super::*;

#[test]
fn test_kernel_state_transitions() {
    let manager = KernelStateManager::new();

    assert_eq!(manager.get_state(), KernelState::Stopped);
    assert!(manager.get_state().can_start());

    assert!(manager.try_transition_to_starting());
    assert_eq!(manager.get_state(), KernelState::Starting);
    assert!(!manager.get_state().can_start());

    manager.mark_running(12081);
    assert_eq!(manager.get_state(), KernelState::Running);
    assert!(manager.get_state().is_running());

    assert!(manager.try_transition_to_stopping());
    assert_eq!(manager.get_state(), KernelState::Stopping);

    manager.mark_stopped();
    assert_eq!(manager.get_state(), KernelState::Stopped);
}

#[test]
fn test_kernel_runtime_config_merge() {
    let mut base = KernelRuntimeConfig {
        api_port: Some(12081),
        proxy_port: Some(12080),
        ..Default::default()
    };

    let overrides = KernelRuntimeConfig {
        api_port: Some(9090),
        prefer_ipv6: Some(true),
        ..Default::default()
    };

    base.merge(&overrides);

    assert_eq!(base.api_port, Some(9090));
    assert_eq!(base.proxy_port, Some(12080)); // 未被覆盖
    assert_eq!(base.prefer_ipv6, Some(true));
}

#[test]
fn test_kernel_state_should_record_higher_priority_startup_diagnosis() {
    let manager = KernelStateManager::new();
    let attempt_id = manager.begin_attempt("test");

    manager.record_startup_diagnosis(StartupDiagnosis {
        attempt_id: attempt_id.clone(),
        stage: StartupStage::Readiness,
        code: "KERNEL_API_TIMEOUT".to_string(),
        kind: StartupDiagnosisKind::ApiTimeout,
        message: "api timeout".to_string(),
        detail: "timeout".to_string(),
        source: "kernel.runtime.startup_stability".to_string(),
        recoverable: true,
        config_path: None,
        http_status: None,
        suggested_actions: None,
        timestamp_ms: 1,
    });
    manager.record_startup_diagnosis(StartupDiagnosis {
        attempt_id,
        stage: StartupStage::Preflight,
        code: "KERNEL_CONFIG_INVALID".to_string(),
        kind: StartupDiagnosisKind::ConfigInvalid,
        message: "config invalid".to_string(),
        detail: "detail".to_string(),
        source: "kernel.runtime.preflight".to_string(),
        recoverable: true,
        config_path: None,
        http_status: None,
        suggested_actions: None,
        timestamp_ms: 2,
    });

    let diagnosis = manager
        .get_startup_diagnosis()
        .expect("should record diagnosis");
    assert_eq!(diagnosis.kind, StartupDiagnosisKind::ConfigInvalid);
    assert_eq!(diagnosis.code, "KERNEL_CONFIG_INVALID");
}
