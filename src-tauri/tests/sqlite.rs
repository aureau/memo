use memo::{
    db::Database,
    models::{Meeting, MeetingTag, TranscriptSegment},
};

fn sample_meeting(id: &str, title: &str) -> Meeting {
    Meeting {
        id: id.to_string(),
        title: title.to_string(),
        day: "Today".to_string(),
        date: "Jun 5".to_string(),
        time: "9:30a".to_string(),
        duration: "12:34".to_string(),
        size: "9.1 MB".to_string(),
        status: "transcribed".to_string(),
        source: "Microphone".to_string(),
        tags: vec![MeetingTag {
            label: "test".to_string(),
            color: "var(--accent-500)".to_string(),
        }],
        transcript: Some(vec![
            TranscriptSegment {
                t: "00:00".to_string(),
                who: "You".to_string(),
                text: "first line".to_string(),
                chapter: None,
            },
            TranscriptSegment {
                t: "04:12".to_string(),
                who: "Mara".to_string(),
                text: "chaptered follow-up".to_string(),
                chapter: Some("Next steps".to_string()),
            },
        ]),
        notes: Some("short test note".to_string()),
        first_line: None,
    }
}

#[test]
fn migrations_and_seed_are_idempotent() {
    let db = Database::open_in_memory().expect("in-memory db");
    db.migrate().expect("second migration pass");

    let first = db
        .seed_meetings(vec![
            sample_meeting("m1", "first"),
            sample_meeting("m2", "second"),
        ])
        .expect("first seed");
    let second = db
        .seed_meetings(vec![
            sample_meeting("m1", "first"),
            sample_meeting("m2", "second"),
        ])
        .expect("second seed");

    assert_eq!(first.len(), 2);
    assert_eq!(second.len(), 2);
    assert_eq!(second[0].id, "m1");
    assert_eq!(second[1].id, "m2");
}

#[test]
fn crud_loop_preserves_nested_meeting_data() {
    let db = Database::open_in_memory().expect("in-memory db");
    let saved = db
        .save_meeting(sample_meeting("rec1", "raw title"))
        .expect("save meeting");

    assert_eq!(saved.first_line.as_deref(), Some("first line"));
    assert_eq!(saved.tags[0].label, "test");
    assert_eq!(
        saved.transcript.as_ref().unwrap()[1].chapter.as_deref(),
        Some("Next steps")
    );

    let renamed = db
        .rename_meeting("rec1", "renamed meeting")
        .expect("rename meeting");
    assert_eq!(renamed.title, "renamed meeting");

    db.delete_meeting("rec1").expect("delete meeting");
    assert!(db.get_meeting("rec1").expect("get deleted").is_none());
}

#[test]
fn invalid_meetings_are_rejected() {
    let db = Database::open_in_memory().expect("in-memory db");
    let mut meeting = sample_meeting("bad", "unsupported");
    meeting.status = "archived".to_string();

    let error = db.save_meeting(meeting).expect_err("invalid status");
    assert!(error.to_string().contains("unsupported meeting status"));
}
