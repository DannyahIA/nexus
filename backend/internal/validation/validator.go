package validation

import (
	"errors"
	"regexp"
	"strings"
	"unicode"
)

var (
	ErrInvalidEmail    = errors.New("invalid email format")
	ErrInvalidUsername = errors.New("invalid username format")
	ErrWeakPassword    = errors.New("password too weak")
	ErrInvalidUUID     = errors.New("invalid UUID format")
)

// EmailRegex pattern for email validation
var EmailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

// UUIDRegex pattern for UUID validation  
var UUIDRegex = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// UsernameRegex pattern for username validation (3-20 chars, alphanumeric + underscore)
var UsernameRegex = regexp.MustCompile(`^[a-zA-Z0-9_]{3,20}$`)

// ValidateEmail validates email format
func ValidateEmail(email string) error {
	if !EmailRegex.MatchString(email) {
		return ErrInvalidEmail
	}
	return nil
}

// ValidateUsername validates username format
func ValidateUsername(username string) error {
	if !UsernameRegex.MatchString(username) {
		return ErrInvalidUsername
	}
	return nil
}

// ValidatePassword validates password strength
func ValidatePassword(password string) error {
	if len(password) < 8 {
		return errors.New("password must be at least 8 characters")
	}

	var (
		hasUpper   bool
		hasLower   bool
		hasNumber  bool
		hasSpecial bool
	)

	for _, char := range password {
		switch {
		case unicode.IsUpper(char):
			hasUpper = true
		case unicode.IsLower(char):
			hasLower = true
		case unicode.IsNumber(char):
			hasNumber = true
		case unicode.IsPunct(char) || unicode.IsSymbol(char):
			hasSpecial = true
		}
	}

	if !hasUpper || !hasLower || !hasNumber {
		return errors.New("password must contain uppercase, lowercase, and number")
	}

	if !hasSpecial {
		return errors.New("password should contain at least one special character")
	}

	return nil
}

// ValidateUUID validates UUID format
func ValidateUUID(uuid string) error {
	if !UUIDRegex.MatchString(strings.ToLower(uuid)) {
		return ErrInvalidUUID
	}
	return nil
}

// SanitizeString removes potentially dangerous characters
func SanitizeString(input string) string {
	// Remove null bytes
	input = strings.ReplaceAll(input, "\x00", "")
	
	// Trim whitespace
	input = strings.TrimSpace(input)
	
	// Limit length
	if len(input) > 1000 {
		input = input[:1000]
	}
	
	return input
}

// ValidateChannelName validates channel name format
func ValidateChannelName(name string) error {
	name = strings.TrimSpace(name)
	if len(name) < 1 || len(name) > 100 {
		return errors.New("channel name must be between 1 and 100 characters")
	}
	
	// Check for invalid characters
	if strings.ContainsAny(name, "<>@#&") {
		return errors.New("channel name contains invalid characters")
	}
	
	return nil
}

// ValidateServerName validates server name format
func ValidateServerName(name string) error {
	name = strings.TrimSpace(name)
	if len(name) < 1 || len(name) > 100 {
		return errors.New("server name must be between 1 and 100 characters")
	}
	return nil
}

// ValidateMessageContent validates message content
func ValidateMessageContent(content string) error {
	content = strings.TrimSpace(content)
	if len(content) < 1 {
		return errors.New("message content cannot be empty")
	}
	if len(content) > 2000 {
		return errors.New("message content too long (max 2000 characters)")
	}
	return nil
}
